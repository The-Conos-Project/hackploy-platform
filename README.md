# Hackploy

![Hackploy](https://img.shields.io/badge/Hackploy-2.1.4-5B70C4?style=for-the-badge)
![Go](https://img.shields.io/badge/Go-1.26-00ADD8?style=for-the-badge&logo=go&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)

Self-hosted platform for running labs and competitions on your own server.

## Install on a VPS

```bash
curl -fsSL https://hackploy.conos.uz/install.sh | sudo bash
```

Then open `http://YOUR_IP/sign-in` — user `root`, password in `~/HACKPLOY.txt`.

Re-running the curl wipes the previous install and sets up a fresh one.

| Need | Command |
| --- | --- |
| Update (CLI) | `sudo hackploy-update` |
| Update (UI) | Settings → Version → Update |
| Reset admin password | `sudo hackploy-reset-admin-password` |

## Develop locally

```bash
go run ./cmd/hackploy          # API on :8080
cd web && pnpm install && pnpm dev   # UI on :5173
```

## Build the image

```bash
docker build -t zohidjonmarufov/hackploy-platform:main \
  --build-arg VERSION="$(tr -d '[:space:]' < VERSION)" .
```

Current release number lives in [`VERSION`](./VERSION) (`2.x.x`, shared with the website and installer).
