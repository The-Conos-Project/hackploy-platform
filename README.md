# Hackploy

Self-hosted CTF platform (Go + React). Challenge metadata: `hackploy.json`.

![Hackploy](https://img.shields.io/badge/Hackploy-2.1.1-5B70C4?style=for-the-badge)
![Go](https://img.shields.io/badge/Go-1.26-00ADD8?style=for-the-badge&logo=go&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-private-111111?style=for-the-badge)

Version file: [`VERSION`](./VERSION) (shared `2.x.x` with install.sh + website).

## Production (VPS)

```bash
curl -fsSL https://hackploy.conos.uz/install.sh | sudo bash
```

Re-running that curl **wipes** any previous Hackploy install, then installs fresh.

Image: `zohidjonmarufov/hackploy-platform:main`  
Admin: `http://YOUR_IP/sign-in` → user `root` + password in `~/HACKPLOY.txt`

| Action | Command |
| --- | --- |
| Update (CLI) | `sudo hackploy-update` |
| Update (UI) | Settings → Version → Update (shows progress page % while restarting) |
| Reset admin | `sudo hackploy-reset-admin-password` |

## Local API + UI

```bash
go run ./cmd/hackploy   # :8080
cd web && pnpm install && pnpm dev   # :5173
```

## Build image

```bash
docker build -t zohidjonmarufov/hackploy-platform:main \
  --build-arg VERSION="$(tr -d '[:space:]' < VERSION)" .
```

See `TRANSITION.md` and `.cursor/rules/hackploy-version.mdc`.
