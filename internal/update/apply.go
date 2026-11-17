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
//
// composeDir is a path on the Docker host (default /etc/hackploy). The platform
// container may not mount that whole tree, so we verify the compose file via a
// one-shot container that binds the host path — not via local os.Stat.
func Apply(ctx context.Context, composeDir, helperImage string) error {
	if composeDir == "" {
		composeDir = "/etc/hackploy"
	}
	if helperImage == "" {
		helperImage = "docker:27-cli"
	}
	composeFile := filepath.Join(composeDir, "docker-compose.yml")
	if _, err := os.Stat("/var/run/docker.sock"); err != nil {
		return fmt.Errorf("docker socket not available")
	}

	// Check host path through the Docker daemon (installer layout lives on the host).
	check := exec.CommandContext(ctx, "docker", "run", "--rm",
		"-v", composeDir+":"+composeDir+":ro",
		"alpine:3.21",
		"test", "-f", composeFile,
	)
	if out, err := check.CombinedOutput(); err != nil {
		return fmt.Errorf("compose project not found at %s on the Docker host (%v: %s)", composeDir, err, string(out))
	}

	_ = exec.CommandContext(ctx, "docker", "rm", "-f", "hackploy-updater").Run()

	script := fmt.Sprintf(
		`set -eu
echo 'Hackploy update: waiting…'
sleep 2
cd '%s'
test -f docker-compose.yml
NGINX_CONF='%s/nginx/default.conf'
if [ -f "$NGINX_CONF" ] && grep -q 'proxy_pass http://platform:8000' "$NGINX_CONF"; then
  echo 'Hackploy update: nginx :8000 → :8080'
  sed -i 's|proxy_pass http://platform:8000|proxy_pass http://platform:8080|g' "$NGINX_CONF"
fi
echo 'Hackploy update: pulling…'
docker compose pull
echo 'Hackploy update: recreating…'
docker compose up -d --force-recreate
NGINX_ID=$(docker compose ps -q nginx 2>/dev/null || true)
if [ -n "$NGINX_ID" ]; then
  docker exec "$NGINX_ID" nginx -s reload >/dev/null 2>&1 || true
fi
echo 'Hackploy update: done.'
`, composeDir, composeDir)

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
