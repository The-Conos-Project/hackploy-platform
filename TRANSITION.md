# Hackploy 1.x → 2.0 transition

Do these **in order**. Do not skip ahead to Docker labs before auth + store.

| # | Phase | Deliverable | Done when |
| --- | --- | --- | --- |
| 0 | **Base** | Go + React scaffold, health/version | `/health` returns `2.0.0-dev`; UI shows status — **done** |
| 1 | **Auth** | Admin (`ADMIN_PASSWORD`) + student register/login sessions | Can sign in as root and as student — **done** |
| 2 | **Store** | SQLite schema + migrations (users, classes, challenges, instances) | No wipe-rewrite; row-level updates — **done** |
| 3 | **Challenges** | Import tar.gz + `hackploy.json`; list/detail UI | Import from Hub URL works — **done** |
| 4 | **Docker labs** | Build/start/stop/extend via Docker CLI | Lab starts; extend resets expiry — **done** |
| 5 | **Classes / flags** | Join codes, assign challenges, flag submit, leaderboard | Classroom flow matches 1.x — **done** |
| 6 | **Domain / SSL** | nginx rewrite + certbot helpers | Custom domain + cert from Settings — **done** |
| 7 | **Self-update** | Compact sidebar version popup; Hub digest + Upgrade | Click version → current/new + upgrade — **done** |
| 8 | **Cutover** | Installer → `:8080` + `/sign-in`; 2.0 CI owns Hub `:main` | Fresh VPS install runs 2.0 — **done** (publish image + redeploy Hub `install.sh`) |

## Rules

1. Challenge metadata is **`hackploy.json`** (no CTFploy naming / no legacy file alias).  
2. Keep `/etc/hackploy` paths for installer compatibility.  
3. Ship semver + `/health` from day one (already in phase 0).  
4. Freeze feature work on 1.x except critical bugs.  
5. **UI: no hype** — plain copy only; title is **Hackploy** (no “2.0” beside it); Conos logo; Google Sans (UI) + Google Sans Code (inputs/code). See `.cursor/rules/hackploy-ui.mdc`.

## Shipped after phase checklist

| Item | Status |
| --- | --- |
| Sidebar groups accordion | **done** |
| User profiles + 8-letter public ID + optional `/u/handle` | **done** (cap 9999 users) |
| Change password | **done** |
| Lab expiry cleanup | **done** |
| Mobile-responsive shell | **done** |
| **Competition mode** | pending — teams, admin start, live points graph |

## Challenge curriculum (parallel track)

Ship RED-0 labs in `ctf-challenges/` while platform phases land.

| Track | Work | Done when |
| --- | --- | --- |
| **C0** | Delete legacy weird packs (`linux-basics`, `linux-trail`) | Gone from Hub repo |
| **C1** | **Linux Basics I** package — easy / medium / hard + theory `./ask` quizzes | `linux-basics-i` importable; 6 flags solve |
| **C2** | Linux Basics II (and later RED-0 modules) same pattern | One package per module |
| **C3** | Hub sync + 2.0 import (phase 3) consumes these tarballs | Fresh import lists stations |

### Flag interaction modes (required for new packs)

1. **Checker** — discover a keyword in the lab → `./checker <keyword>` prints `CN{...}`.  
2. **Ask script** — theory stations ship `./ask` (+ `answers.env`) in the station folder; student runs it and **types answers**; correct run prints the flag. Not every flag must be “found on disk.”

Difficulty mix per module package: **≥2 easy, ≥2 medium, ≥1 hard** (Basics I ships 2/2/2).

Reference pack: `ctf-challenges/challenges/linux-basics-i/` (`build/` source + Hub `.tar.gz` + `.md`).
