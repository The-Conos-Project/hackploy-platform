# Ubuntu via Multipass (local VPS, on-demand)

CLI-only Ubuntu VM for Hackploy testing. **Does not start on boot** — you start it when you need it and stop it when done.

**Script directory:**

```text
/home/zohid/Documents/Projects/Conos/Code/hackploy-platform/scripts/multipass-ubuntu
```

```bash
cd /home/zohid/Documents/Projects/Conos/Code/hackploy-platform/scripts/multipass-ubuntu
```

Instance: **`hackploy`** (Ubuntu **24.04**, 4 CPU / 4 GB / 40 GB).

---

## One-time host install

```bash
./install-multipass.sh
./multipass-ubuntu.sh create
./multipass-ubuntu.sh ondemand   # disable boot autostart
```

`ondemand` stops the VM and runs `snap stop --disable multipass` so Multipass does **not** load at login/boot.

---

## When you need the VM

```bash
cd /home/zohid/Documents/Projects/Conos/Code/hackploy-platform/scripts/multipass-ubuntu
./multipass-ubuntu.sh shell    # starts daemon + VM, then login
```

Or:

```bash
./multipass-ubuntu.sh start
./multipass-ubuntu.sh shell
```

## When finished

```bash
./multipass-ubuntu.sh stop     # stops VM + multipassd (frees RAM)
```

After reboot nothing Multipass-related is running until you `start` / `shell` again.  
Do **not** run `create` again unless you destroyed the VM.

IP may change — prefer `shell` over hard-coding the IP.

---

## Commands

| Command | What it does |
| --- | --- |
| `shell` | Start if needed, open a shell |
| `start` | Start daemon + VM |
| `stop` | Stop VM + daemon |
| `ondemand` | One-time: disable autostart on boot |
| `status` / `ip` | Info |
| `destroy` / `recreate` | Wipe / rebuild VM |

---

## What persists / what does not

| Persists | Does not |
| --- | --- |
| VM disk & files while Stopped | Running CPU/RAM after `stop` or reboot |
| Multipass package install | Autostart (disabled via `ondemand`) |
| | `destroy` / `recreate` (wipes VM) |

---

## Specs & network

Defaults: `CPUS=4` `MEM=4G` `DISK=40G` `IMAGE=24.04`.

Optional LAN NIC: `BRIDGE_NIC=wlp0s20f3 ./multipass-ubuntu.sh recreate`

Prefer **24.04** over `lts` / `26.04` on this host.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `multipassd not ready` | `sudo snap start multipass` then `./multipass-ubuntu.sh start` |
| Still starts on boot | `./multipass-ubuntu.sh ondemand` (needs sudo once) |
| Instance missing | `./multipass-ubuntu.sh create` then `ondemand` |
