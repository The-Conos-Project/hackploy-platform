#!/usr/bin/env bash
# Enable snap (if blocked) and install Multipass.
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  exec sudo bash "$0" "$@"
fi

if [[ -f /etc/apt/preferences.d/nosnap.pref ]]; then
  echo "removing /etc/apt/preferences.d/nosnap.pref …"
  rm -f /etc/apt/preferences.d/nosnap.pref
fi

apt update
# snapd is often held / pinned / masked on this host
apt install -y --allow-change-held-packages snapd

# Ubuntu "no snap" setups mask the unit — undo that
systemctl unmask snapd.service snapd.socket 2>/dev/null || true
systemctl enable snapd.socket snapd.service 2>/dev/null || true
systemctl start snapd.socket snapd.service

# classic snap seed path
ln -sfn /var/lib/snapd/snap /snap 2>/dev/null || true

# wait until snapd answers
ok=0
for _ in $(seq 1 60); do
  if snap version >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 1
done
if [[ "$ok" -ne 1 ]]; then
  echo "snapd still not responding. Check: systemctl status snapd" >&2
  exit 1
fi

snap install multipass
snap start multipass >/dev/null 2>&1 || true

# multipassd needs a few seconds to write its TLS cert
ok=0
for i in $(seq 1 60); do
  if multipass version >/dev/null 2>&1 && multipass list >/dev/null 2>&1; then
    ok=1
    break
  fi
  echo "waiting for multipassd… ($i)"
  sleep 1
done
if [[ "$ok" -ne 1 ]]; then
  echo "multipassd not ready. Try: sudo snap restart multipass" >&2
  exit 1
fi

echo
multipass version
echo
echo "OK — next: ./multipass-ubuntu.sh create"
