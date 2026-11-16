# Ubuntu Server in VirtualBox (recreate script)

Skip the installer UI. This uses an Ubuntu **cloud image** + **cloud-init**, so you can delete and rebuild the VM in one command.

## One-time

```bash
chmod +x ./vbox-ubuntu.sh
# SSH key (already present if you have ~/.ssh/id_ed25519.pub)
```

## Daily

```bash
./vbox-ubuntu.sh create      # first time (downloads image once)
./vbox-ubuntu.sh ssh         # after ~1–2 min cloud-init
./vbox-ubuntu.sh destroy     # wipe VM
./vbox-ubuntu.sh recreate    # wipe + create again
```

Default network is **bridged** on `wlp0s20f3` (LAN IP for custom domain):

```bash
./vbox-ubuntu.sh create
./vbox-ubuntu.sh ip
./vbox-ubuntu.sh ssh
```

Ethernet instead: `BRIDGE_NIC=enp62s0 ./vbox-ubuntu.sh recreate`  
NAT fallback: `NET_MODE=nat ./vbox-ubuntu.sh recreate` (SSH `127.0.0.1:2222`)

## After SSH

Install Hackploy with your normal `install.sh` inside the guest (same as a VPS).

## Notes

- Cached image: `~/.cache/hackploy-vbox/images/` (kept across destroy)
- VM files: `~/.cache/hackploy-vbox/vms/hackploy-ubuntu/`
- Defaults: 4 CPU, 4 GB RAM, 40 GB **dynamic** disk (virtual size only; grows as used) — override with `CPUS` `MEM_MB` `DISK_GB`
