package dockerx

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

type StartRequest struct {
	ChallengeID   string
	ImageTag      string
	UserID        string
	Username      string
	Password      string
	ChallengeName string
	PackageName   string
	TimeoutSec    int
}

type RunningLab struct {
	InstanceID    string
	ContainerID   string
	ContainerName string
	HostPort      int
	Connection    string
	ExpiresAt     time.Time
	Username      string
	Password      string
}

func StartLab(ctx context.Context, req StartRequest) (*RunningLab, error) {
	if req.Username == "" || req.Password == "" {
		return nil, fmt.Errorf("challenge credentials missing")
	}
	if err := EnsureNetwork(ctx); err != nil {
		return nil, err
	}

	imageRef := req.ImageTag
	if !strings.Contains(imageRef, ":") {
		imageRef += ":latest"
	}
	if err := exec.CommandContext(ctx, "docker", "image", "inspect", imageRef).Run(); err != nil {
		return nil, fmt.Errorf("image not found (%s): rebuild the lab", imageRef)
	}

	internalPort := 22
	out, _ := exec.CommandContext(ctx, "docker", "image", "inspect",
		"--format", "{{json .Config.ExposedPorts}}", imageRef).Output()
	exposed := strings.TrimSpace(string(out))
	if exposed != "" && exposed != "null" {
		var ports map[string]any
		if json.Unmarshal([]byte(exposed), &ports) == nil {
			for k := range ports {
				if strings.HasSuffix(k, "/tcp") {
					n, _ := strconv.Atoi(strings.TrimSuffix(k, "/tcp"))
					if n == 22 {
						internalPort = 22
						break
					}
					if n > 0 {
						internalPort = n
					}
				}
			}
		}
	}

	name := fmt.Sprintf("hackploy-%s-%d", req.ChallengeID, time.Now().Unix())
	args := []string{
		"run", "-d",
		"--name", name,
		"--network", NetworkName,
		"--memory", "512m",
		"--cpus", "0.5",
		"-p", fmt.Sprintf("0.0.0.0::%d", internalPort),
		"-e", "CTF_USER=" + req.Username,
		"-e", "CTF_PASSWORD=" + req.Password,
		"-e", "SSH_USER=" + req.Username,
		"-e", "SSH_PASSWORD=" + req.Password,
		"--label", "hackploy.instance=1",
		"--label", "hackploy.challenge_id=" + req.ChallengeID,
		"--label", "hackploy.user_id=" + req.UserID,
	}
	if req.ChallengeName != "" && req.ChallengeName != req.PackageName {
		args = append(args, "-e", "CHALLENGE_NAME="+req.ChallengeName)
	}
	args = append(args, imageRef)

	cmd := exec.CommandContext(ctx, "docker", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("docker run: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	containerID := strings.TrimSpace(string(out))

	var hostPort int
	for i := 0; i < 20; i++ {
		portOut, err := exec.CommandContext(ctx, "docker", "port", containerID, fmt.Sprintf("%d/tcp", internalPort)).Output()
		if err == nil {
			line := strings.TrimSpace(string(portOut))
			// 0.0.0.0:32768
			if idx := strings.LastIndex(line, ":"); idx >= 0 {
				hostPort, _ = strconv.Atoi(line[idx+1:])
				if hostPort > 0 {
					break
				}
			}
		}
		time.Sleep(250 * time.Millisecond)
	}
	if hostPort == 0 {
		_ = StopLab(ctx, containerID)
		return nil, fmt.Errorf("docker did not publish a host port")
	}

	timeout := req.TimeoutSec
	if timeout <= 0 {
		timeout = 7200
	}
	conn := "ssh"
	if internalPort != 22 {
		conn = "tcp"
	}
	return &RunningLab{
		InstanceID:    uuid.NewString()[:8],
		ContainerID:   containerID,
		ContainerName: name,
		HostPort:      hostPort,
		Connection:    conn,
		ExpiresAt:     time.Now().UTC().Add(time.Duration(timeout) * time.Second),
		Username:      req.Username,
		Password:      req.Password,
	}, nil
}

func StopLab(ctx context.Context, containerID string) error {
	_ = exec.CommandContext(ctx, "docker", "rm", "-f", containerID).Run()
	return nil
}

func CountRunningForUser(ctx context.Context, userID string) (int, error) {
	out, err := exec.CommandContext(ctx, "docker", "ps",
		"--filter", "label=hackploy.user_id="+userID,
		"--format", "{{.ID}}").Output()
	if err != nil {
		return 0, err
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	n := 0
	for _, line := range lines {
		if strings.TrimSpace(line) != "" {
			n++
		}
	}
	return n, nil
}
