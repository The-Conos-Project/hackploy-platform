package update

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

// Apply schedules a compose pull + recreate via a short-lived docker CLI helper,
// same pattern as Hackploy 1.x (so the API container can restart safely).
func Apply(ctx context.Context, composeDir, helperImage string) error {
	if composeDir == "" {
		composeDir = "/etc/hackploy"
	}
	if helperImage == "" {
		helperImage = "docker:27-cli"
	}
	composeFile := filepath.Join(composeDir, "docker-compose.yml")
	if _, err := os.Stat(composeFile); err != nil {
		return fmt.Errorf("compose project not found at %s (dev installs update with: docker compose pull && up -d)", composeDir)
	}
	if _, err := os.Stat("/var/run/docker.sock"); err != nil {
		return fmt.Errorf("docker socket not available")
	}

	_ = exec.CommandContext(ctx, "docker", "rm", "-f", "hackploy-updater").Run()

	script := fmt.Sprintf(
		`set -eu
echo 'Hackploy update: waiting…'
sleep 2
cd '%s'
test -f docker-compose.yml
echo 'Hackploy update: pulling…'
docker compose pull
echo 'Hackploy update: recreating…'
docker compose up -d --force-recreate
echo 'Hackploy update: done.'
`, composeDir)

	cmd := exec.CommandContext(ctx, "docker", "run", "-d", "--rm",
		"--name", "hackploy-updater",
		"-v", "/var/run/docker.sock:/var/run/docker.sock",
		"-v", composeDir+":"+composeDir,
		"-w", composeDir,
		"--entrypoint", "/bin/sh",
		helperImage,
		"-c", script,
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("start updater: %w (%s)", err, string(out))
	}
	return nil
}

// WaitBrief gives the HTTP response time to flush before the platform container dies.
func WaitBrief() {
	time.Sleep(50 * time.Millisecond)
}
