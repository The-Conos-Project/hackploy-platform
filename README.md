# Hackploy 2.0 (Go + React)

Self-hosted CTF platform rewrite. **1.x** remains in `../ctfploy-platform` until cutover.

## Stack

- **Go** API (`chi`) — versioned `/health`, `/api/v1/*`
- **Vite + React + TS** — Lucide icons, lean shadcn-style UI, Tailwind v4
- One image/binary serves API + static UI

## Phase 0 (now)

- [x] Go server + version embed
- [x] `/health`, `/ready`, `/api/v1/status`, `/api/v1/version`
- [x] React shell that reads health/status
- [ ] Phase 1: Auth

See `TRANSITION.md` and `../conos/HACKPLOY-2.0.md`.

## Dev

```bash
# terminal 1 — API
cd hackploy-platform
go run ./cmd/hackploy

# terminal 2 — UI (proxies /api to :8080)
cd web
pnpm install
pnpm dev
```

Open http://localhost:5173

## Build

```bash
cd web && pnpm build && cd ..
go build -o bin/hackploy ./cmd/hackploy
./bin/hackploy   # serves web/dist on :8080
```
