package update

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Apply schedules a compose pull + recreate via a short-lived docker CLI helper,
// same pattern as Hackploy 1.x (so the API container can restart safely).
//
// While the platform is down, a tiny nginx container serves an updating page with
// percentage progress (see progress_page.go). Only the platform service is
// recreated so nginx can keep proxying to that progress UI.
//
// Important: the shell script below is assembled with fmt.Sprintf. Any literal
// "%" intended for the shell (e.g. printf formats) MUST be written as "%%".
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

	// Prefer a host-side check when the compose dir is visible in this container
	// (install mounts /etc/hackploy into platform). Falls back to alpine probe.
	if _, err := os.Stat(composeFile); err != nil {
		check := exec.CommandContext(ctx, "docker", "run", "--rm",
			"-v", composeDir+":"+composeDir+":ro",
			"alpine:3.21",
			"test", "-f", composeFile,
		)
		if out, err := check.CombinedOutput(); err != nil {
			return fmt.Errorf("compose project not found at %s on the Docker host (%v: %s)", composeDir, err, string(out))
		}
	}

	_ = exec.CommandContext(ctx, "docker", "rm", "-f", "hackploy-updater").Run()
	_ = exec.CommandContext(ctx, "docker", "rm", "-f", "hackploy-update-ui").Run()

	progressDir := filepath.Join(composeDir, "update-progress")
	// Escape only the intentional placeholders. Shell printf uses %% so Go
	// leaves a single % for the shell.
	script := fmt.Sprintf(`set -eu
COMPOSE_DIR='%s'
PROGRESS_DIR='%s'
NGINX_CONF="$COMPOSE_DIR/nginx/default.conf"
NGINX_BAK="$COMPOSE_DIR/nginx/default.conf.pre-update"
PROGRESS_UI=hackploy-update-ui
LOG="$PROGRESS_DIR/updater.log"

write_progress() {
  pct="$1"; msg="$2"; detail="${3:-}"; done_flag="${4:-false}"
  # Avoid shell printf %% verbs inside Go fmt — write JSON with a heredoc.
  cat > "$PROGRESS_DIR/progress.json" <<EOF
{"pct":$pct,"msg":"$msg","detail":"$detail","done":$done_flag}
EOF
}

cleanup_ui() {
  if [ -f "$NGINX_BAK" ]; then
    mv -f "$NGINX_BAK" "$NGINX_CONF" || true
    NGINX_ID=$(cd "$COMPOSE_DIR" && docker compose ps -q nginx 2>/dev/null || true)
    if [ -n "$NGINX_ID" ]; then
      docker exec "$NGINX_ID" nginx -s reload >/dev/null 2>&1 || true
    fi
  fi
  docker rm -f "$PROGRESS_UI" >/dev/null 2>&1 || true
}

trap cleanup_ui EXIT

echo 'Hackploy update: preparing progress UI…'
mkdir -p "$PROGRESS_DIR"
: > "$LOG"
exec >>"$LOG" 2>&1

cat > "$PROGRESS_DIR/index.html" <<'HTML'
%s
HTML
write_progress 5 "Preparing update…" "progress UI"

cd "$COMPOSE_DIR"
test -f docker-compose.yml

# Copy Google Sans fonts from the still-running platform so the progress page matches the app.
PLATFORM_ID=$(docker compose ps -q platform 2>/dev/null || true)
if [ -n "$PLATFORM_ID" ]; then
  docker cp "$PLATFORM_ID:/app/web/dist/fonts" "$PROGRESS_DIR/fonts" >/dev/null 2>&1 || true
fi

# Heal leftover 1.x nginx proxies
if [ -f "$NGINX_CONF" ] && grep -q 'proxy_pass http://platform:8000' "$NGINX_CONF"; then
  sed -i 's|proxy_pass http://platform:8000|proxy_pass http://platform:8080|g' "$NGINX_CONF"
fi

NGINX_ID=$(docker compose ps -q nginx 2>/dev/null || true)
NET=""
if [ -n "$NGINX_ID" ]; then
  NET=$(docker inspect -f '{{range $k, $_ := .NetworkSettings.Networks}}{{println $k}}{{end}}' "$NGINX_ID" | head -n1)
fi
if [ -z "$NET" ]; then
  NET=$(docker network ls --format '{{.Name}}' | grep -E 'hackploy' | head -n1 || true)
fi

write_progress 12 "Starting progress page…" "${NET:-bridge}"
docker rm -f "$PROGRESS_UI" >/dev/null 2>&1 || true
if [ -n "$NET" ]; then
  docker run -d --rm --name "$PROGRESS_UI" --network "$NET" \
    -v "$PROGRESS_DIR:/usr/share/nginx/html:ro" \
    nginx:alpine >/dev/null
else
  docker run -d --rm --name "$PROGRESS_UI" \
    -v "$PROGRESS_DIR:/usr/share/nginx/html:ro" \
    nginx:alpine >/dev/null
fi

# Point nginx at the progress UI so users still see something while platform restarts
if [ -f "$NGINX_CONF" ] && [ -n "$NGINX_ID" ]; then
  cp "$NGINX_CONF" "$NGINX_BAK"
  cat > "$NGINX_CONF" <<'NGX'
server {
    listen 80;
    server_name _;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        proxy_pass http://hackploy-update-ui:80;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_buffering off;
    }
}
NGX
  docker exec "$NGINX_ID" nginx -s reload >/dev/null 2>&1 || true
fi

write_progress 25 "Pulling new image…" "docker compose pull"
docker compose pull
write_progress 70 "Recreating platform…" "force-recreate platform"
# Keep nginx up so the progress page stays reachable
docker compose up -d --force-recreate --no-deps platform

# Keep host VERSION in sync with the running image when possible
if [ -f "$COMPOSE_DIR/.env" ]; then
  # shellcheck disable=SC1091
  . "$COMPOSE_DIR/.env" || true
fi
IMG="${PLATFORM_IMAGE:-zohidjonmarufov/hackploy-platform:main}"
VER=$(docker run --rm --entrypoint cat "$IMG" /app/VERSION 2>/dev/null || true)
if [ -n "$VER" ]; then
  printf '%%s\n' "$VER" > "$COMPOSE_DIR/VERSION" || true
fi

write_progress 90 "Restoring proxy…" "nginx"

# Restore normal nginx config before removing UI
if [ -f "$NGINX_BAK" ]; then
  mv -f "$NGINX_BAK" "$NGINX_CONF"
  NGINX_ID=$(docker compose ps -q nginx 2>/dev/null || true)
  if [ -n "$NGINX_ID" ]; then
    docker exec "$NGINX_ID" nginx -s reload >/dev/null 2>&1 || true
  fi
fi

write_progress 100 "Update complete" "reloading" true
sleep 2
docker rm -f "$PROGRESS_UI" >/dev/null 2>&1 || true
trap - EXIT
echo 'Hackploy update: done.'
`, composeDir, progressDir, progressIndexHTML)

	// Sanity: no leftover Go missing-arg markers from accidental %% / %s bugs.
	if strings.Contains(script, "%!") {
		return fmt.Errorf("internal update script formatting error")
	}

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
