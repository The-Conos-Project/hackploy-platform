package update

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"strings"
	"time"

	"github.com/The-Conos-Project/hackploy-platform/internal/version"
)

type Status struct {
	Current         string    `json:"current"`
	Image           string    `json:"image"`
	Tag             string    `json:"tag"`
	LocalDigest     string    `json:"local_digest,omitempty"`
	RemoteDigest    string    `json:"remote_digest,omitempty"`
	UpdateAvailable bool      `json:"update_available"`
	CheckedAt       time.Time `json:"checked_at"`
	Error           string    `json:"error,omitempty"`
}

type Checker struct {
	Image      string // e.g. zohidjonmarufov/hackploy-platform:main
	HTTPClient *http.Client
}

func NewChecker(image string) *Checker {
	if image == "" {
		image = "zohidjonmarufov/hackploy-platform:main"
	}
	return &Checker{
		Image: image,
		HTTPClient: &http.Client{
			Timeout: 12 * time.Second,
		},
	}
}

func (c *Checker) repoAndTag() (repo, tag string) {
	image := c.Image
	repo, tag, ok := strings.Cut(image, ":")
	if !ok || tag == "" {
		return image, "main"
	}
	return repo, tag
}

func (c *Checker) Check(ctx context.Context) Status {
	repo, tag := c.repoAndTag()
	st := Status{
		Current:   version.Version,
		Image:     c.Image,
		Tag:       tag,
		CheckedAt: time.Now().UTC(),
	}

	remote, err := c.remoteDigest(ctx, repo, tag)
	if err != nil {
		st.Error = err.Error()
		return st
	}
	st.RemoteDigest = remote

	local, err := localDigest(ctx, c.Image)
	if err == nil {
		st.LocalDigest = local
	}

	if st.LocalDigest != "" && st.RemoteDigest != "" {
		st.UpdateAvailable = !digestEqual(st.LocalDigest, st.RemoteDigest)
	} else if st.RemoteDigest != "" && strings.Contains(version.Version, "dev") {
		// Dev builds are never "behind" a Hub image for auto-update UX.
		st.UpdateAvailable = false
	}

	return st
}

type hubTagResponse struct {
	Digest string `json:"digest"`
	Images []struct {
		Digest string `json:"digest"`
	} `json:"images"`
}

func (c *Checker) remoteDigest(ctx context.Context, repo, tag string) (string, error) {
	url := fmt.Sprintf("https://hub.docker.com/v2/repositories/%s/tags/%s", repo, tag)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("docker hub: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return "", fmt.Errorf("image tag not found on Docker Hub: %s:%s", repo, tag)
	}
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("docker hub HTTP %d", resp.StatusCode)
	}
	var body hubTagResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", err
	}
	if body.Digest != "" {
		return body.Digest, nil
	}
	for _, img := range body.Images {
		if img.Digest != "" {
			return img.Digest, nil
		}
	}
	return "", fmt.Errorf("no digest in Docker Hub response")
}

func localDigest(ctx context.Context, image string) (string, error) {
	cmd := exec.CommandContext(ctx, "docker", "image", "inspect", "--format", "{{index .RepoDigests 0}}", image)
	out, err := cmd.Output()
	if err != nil {
		// Fallback: Image ID
		cmd = exec.CommandContext(ctx, "docker", "image", "inspect", "--format", "{{.Id}}", image)
		out, err = cmd.Output()
		if err != nil {
			return "", err
		}
	}
	raw := strings.TrimSpace(string(out))
	if raw == "" || raw == "<no value>" {
		return "", fmt.Errorf("empty local digest")
	}
	if _, dig, ok := strings.Cut(raw, "@"); ok {
		return dig, nil
	}
	return raw, nil
}

func digestEqual(a, b string) bool {
	return normalizeDigest(a) == normalizeDigest(b)
}

func normalizeDigest(d string) string {
	d = strings.TrimSpace(d)
	if i := strings.Index(d, "sha256:"); i >= 0 {
		return d[i:]
	}
	return d
}
