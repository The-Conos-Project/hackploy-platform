# Ubuntu via Multipass (local VPS)

CLI-only Ubuntu VM for Hackploy testing. No VirtualBox GUI.

**Script directory (absolute path):**

```text
/home/zohid/Documents/Projects/Conos/Code/hackploy-platform/scripts/multipass-ubuntu
```

```bash
cd /home/zohid/Documents/Projects/Conos/Code/hackploy-platform/scripts/multipass-ubuntu
```

Instance name: **`hackploy`** (Ubuntu **24.04**, 4 CPU / 4 GB / 40 GB).

---

## One-time host install

Snap was blocked/masked on some Conos hosts. Use the installer:

```bash
./install-multipass.sh
```

That removes `nosnap.pref` if present, installs `snapd` (held packages allowed), unmasks `snapd`, installs Multipass, and waits until `multipassd` is ready.

Manual equivalent:

```bash
sudo rm -f /etc/apt/preferences.d/nosnap.pref
sudo apt update
sudo apt install -y --allow-change-held-packages snapd
sudo systemctl unmask snapd.service snapd.socket
sudo systemctl enable --now snapd.socket snapd.service
sudo snap install multipass
```

Then create the VM once:

```bash
./multipass-ubuntu.sh create
./multipass-ubuntu.sh shell
```

First create downloads the cloud image (~1–3+ min).

---

## Daily use

```bash
cd /home/zohid/Documents/Projects/Conos/Code/hackploy-platform/scripts/multipass-ubuntu

./multipass-ubuntu.sh status   # or: multipass list
./multipass-ubuntu.sh shell    # login (no password)
./multipass-ubuntu.sh ip       # Multipass NAT IPv4
./multipass-ubuntu.sh stop
./multipass-ubuntu.sh start
```

Or without the script:

```bash
multipass shell hackploy
multipass exec hackploy -- bash
```

---

## After reboot

Multipass daemon (`multipass.multipassd`) is **enabled** and starts with the system.

1. Open a terminal.
2. `multipass list`
3. If `hackploy` is **Stopped**: `./multipass-ubuntu.sh start`
4. `./multipass-ubuntu.sh shell`

You do **not** run `create` again after a normal reboot.

IP may change after reboot — prefer `shell` over hard-coding the IP.

---

## What persists / what does not

| Persists | Does not / wipes |
| --- | --- |
| VM disk, packages, files inside the guest | `./multipass-ubuntu.sh destroy` |
| Multipass install across reboots | `./multipass-ubuntu.sh recreate` (destroy + create) |
| | Uninstalling `multipass` / `snapd` |

---

## Specs & network

Defaults: `CPUS=4` `MEM=4G` `DISK=40G` `IMAGE=24.04` `VM_NAME=hackploy`.

Default network is Multipass **NAT** (easy CLI access via `shell`).

Optional extra LAN / bridged NIC (can briefly disrupt Wi‑Fi while bridging):

```bash
BRIDGE_NIC=wlp0s20f3 ./multipass-ubuntu.sh recreate
```

Do not use `IMAGE=lts` / `26.04` on this host unless Multipass’s Resolute image hash is healthy — prefer **24.04**.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `multipassd not ready` / missing root cert | `sudo snap restart multipass` then wait ~10s |
| `snapd.service is masked` | `sudo systemctl unmask snapd.service snapd.socket` then enable/start |
| Held package error installing snapd | `apt install -y --allow-change-held-packages snapd` |
| Image hash mismatch | Use `IMAGE=24.04` (script default) |
| Instance missing | `./multipass-ubuntu.sh create` again |
