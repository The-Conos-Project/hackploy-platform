# Hackploy 1.x → 2.0 transition

Do these **in order**. Do not skip ahead to Docker labs before auth + store.

| # | Phase | Deliverable | Done when |
| --- | --- | --- | --- |
| 0 | **Base** | Go + React scaffold, health/version | `/health` returns `2.0.0-dev`; UI shows status |
| 1 | **Auth** | Admin (`ADMIN_PASSWORD`) + student register/login sessions | Can sign in as root and as student |
| 2 | **Store** | SQLite schema + migrations (users, classes, challenges, instances) | No wipe-rewrite; row-level updates |
| 3 | **Challenges** | Import tar.gz + `ctfploy.json`; list/detail UI | Import from Hub URL works |
| 4 | **Docker labs** | Build/start/stop/extend/cleanup via Docker SDK | Lab starts; **extend fixes timer** |
| 5 | **Classes / flags** | Join codes, assign challenges, flag submit, leaderboard | Classroom flow matches 1.x |
| 6 | **Domain / SSL** | nginx rewrite + certbot helpers | Custom domain + cert from Settings |
| 7 | **Self-update** | Settings shows version; compose update path | `hackploy-update` works for 2.0 image |
| 8 | **Cutover** | Installer default image → 2.0; keep Hub site | Fresh VPS install runs 2.0 |

## Rules

1. Keep `ctfploy.json` format unchanged.  
2. Keep `/etc/hackploy` paths for installer compatibility.  
3. Ship semver + `/health` from day one (already in phase 0).  
4. Freeze feature work on 1.x except critical bugs.
