# Hackploy 2.0 (Go + React)

Self-hosted CTF platform. Challenge metadata: `hackploy.json`.

## Production (VPS)

Installer (writes `/etc/hackploy`, nginx → `:8080`):

```bash
curl -fsSL https://hackploy.conos.uz/install.sh | sudo bash
```

Image: `zohidjonmarufov/hackploy-platform:main`  
Admin: `http://YOUR_IP/sign-in` → user `root` + printed password.

Update later: `sudo hackploy-update`

## Local API + UI

```bash
# terminal 1
go run ./cmd/hackploy   # :8080 — set ADMIN_PASSWORD

# terminal 2
cd web && pnpm install && pnpm dev   # :5173
```

## Build image

```bash
docker build -t zohidjonmarufov/hackploy-platform:main \
  --build-arg VERSION=2.0.0 .
docker push zohidjonmarufov/hackploy-platform:main
```

See `TRANSITION.md`.
