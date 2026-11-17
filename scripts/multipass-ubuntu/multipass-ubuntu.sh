#!/usr/bin/env bash
# Ubuntu VM for Hackploy local VPS testing via Multipass (CLI only, on-demand).
# Usage: ./multipass-ubuntu.sh create|start|stop|destroy|recreate|status|ssh|ip|shell|ondemand
set -euo pipefail

VM_NAME="${VM_NAME:-hackploy}"
CPUS="${CPUS:-4}"
MEM="${MEM:-4G}"
DISK="${DISK:-40G}"
# Prefer a stable release — "lts" on 26.04 hosts can pull a broken Resolute cloud image.
IMAGE="${IMAGE:-24.04}"
# Optional extra bridged NIC (LAN IP). Leave empty for Multipass NAT only.
BRIDGE_NIC="${BRIDGE_NIC:-}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1 (install Multipass first — see README)" >&2; exit 1; }; }

# Start multipassd only when needed (it may be disabled for on-demand use).
start_daemon() {
  if multipass list >/dev/null 2>&1; then
    return 0
  fi
  if command -v snap >/dev/null 2>&1; then
    snap start multipass >/dev/null 2>&1 \
      || sudo snap start multipass >/dev/null 2>&1 \
      || true
  fi
  local i
  for i in $(seq 1 45); do
    if multipass list >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "multipassd not ready — try: sudo snap start multipass" >&2
  return 1
}

# Stop multipassd so nothing Multipass-related runs after you're done.
stop_daemon() {
  if ! command -v snap >/dev/null 2>&1; then
    return 0
  fi
  snap stop multipass >/dev/null 2>&1 \
    || sudo snap stop multipass >/dev/null 2>&1 \
    || true
}

ensure() {
  need multipass
  start_daemon || exit 1
}

vm_exists() {
  multipass info "$VM_NAME" >/dev/null 2>&1
}

create_vm() {
  ensure
  if vm_exists; then
    echo "VM already exists: $VM_NAME (destroy first or use recreate)" >&2
    exit 1
  fi

  local args=(launch "$IMAGE" --name "$VM_NAME" --cpus "$CPUS" --memory "$MEM" --disk "$DISK")
  if [[ -n "$BRIDGE_NIC" ]]; then
    args+=(--network "name=${BRIDGE_NIC},mode=auto")
    echo "extra NIC: bridged on $BRIDGE_NIC"
  fi

  echo "launching $VM_NAME ($CPUS / $MEM / $DISK, image=$IMAGE)…"
  multipass "${args[@]}"
  # Keep disk; do not auto-start on host boot
  disable_autostart

  echo
  echo "Ready (on-demand — will not start on boot):"
  echo "  ./multipass-ubuntu.sh shell"
  echo "  ./multipass-ubuntu.sh stop    # when finished"
}

destroy_vm() {
  ensure
  if ! vm_exists; then
    echo "no VM named $VM_NAME"
    return
  fi
  multipass delete --purge "$VM_NAME"
  echo "gone."
}

cmd_ssh() {
  ensure
  if ! vm_exists; then
    echo "VM missing" >&2
    exit 1
  fi
  # start instance if stopped
  local st
  st="$(multipass info "$VM_NAME" --format csv 2>/dev/null | awk -F, 'NR==2{print $2}' || true)"
  if [[ "${st,,}" == "stopped" ]]; then
    multipass start "$VM_NAME"
  fi
  exec multipass exec "$VM_NAME" -- sudo -u ubuntu -i
}

cmd_shell() {
  ensure
  if ! vm_exists; then
    echo "VM missing — run: $0 create" >&2
    exit 1
  fi
  local st
  st="$(multipass info "$VM_NAME" --format csv 2>/dev/null | awk -F, 'NR==2{print $2}' || true)"
  if [[ "${st,,}" == "stopped" ]]; then
    multipass start "$VM_NAME"
  fi
  exec multipass shell "$VM_NAME"
}

cmd_ip() {
  ensure
  if ! vm_exists; then
    echo "VM missing" >&2
    exit 1
  fi
  multipass info "$VM_NAME" --format json | python3 -c '
import json,sys
d=json.load(sys.stdin)
info=d.get("info") or d
inst=next(iter(info.values())) if isinstance(info,dict) else {}
ips=inst.get("ipv4") or []
print("\n".join(ips) if ips else "pending")
'
}

cmd_status() {
  if ! multipass list >/dev/null 2>&1; then
    echo "daemon=stopped (on-demand — run: $0 start)"
    exit 0
  fi
  if ! vm_exists; then
    echo "missing"
    exit 0
  fi
  multipass info "$VM_NAME"
}

cmd_start() {
  ensure
  if ! vm_exists; then
    echo "VM missing — run: $0 create" >&2
    exit 1
  fi
  multipass start "$VM_NAME"
  echo "started $VM_NAME"
}

cmd_stop() {
  if multipass list >/dev/null 2>&1 && vm_exists; then
    multipass stop "$VM_NAME" 2>/dev/null || true
    echo "stopped $VM_NAME"
  fi
  stop_daemon
  echo "multipassd stopped (nothing running until you start again)"
}

# One-time: stop VM + disable multipass from starting on boot.
disable_autostart() {
  if command -v snap >/dev/null 2>&1; then
    snap stop --disable multipass >/dev/null 2>&1 \
      || sudo snap stop --disable multipass >/dev/null 2>&1 \
      || true
  fi
}

cmd_ondemand() {
  ensure
  if vm_exists; then
    multipass stop "$VM_NAME" 2>/dev/null || true
  fi
  echo "disabling multipass autostart on boot…"
  if snap stop --disable multipass >/dev/null 2>&1; then
    :
  elif sudo snap stop --disable multipass; then
    :
  else
    echo "failed — run: sudo snap stop --disable multipass" >&2
    exit 1
  fi
  echo "done. On-demand only:"
  echo "  $0 start   # or: $0 shell"
  echo "  $0 stop    # frees RAM; nothing on next boot"
}

usage() {
  cat <<EOF
Usage: $0 <command>

  create     launch Ubuntu via Multipass (then disable boot autostart)
  start      start daemon + VM (when you need it)
  stop       stop VM + daemon (frees RAM; stays off across reboot)
  destroy    delete VM
  recreate   destroy + create
  status     show info
  shell      start if needed, then login
  ssh        login as ubuntu
  ip         print IPv4 address(es)
  ondemand   stop VM and disable multipass on boot (one-time)

Env (optional):
  VM_NAME CPUS MEM DISK IMAGE=24.04 BRIDGE_NIC

Examples:
  $0 ondemand     # once — never auto-start on boot
  $0 shell        # when you need the VM
  $0 stop         # when finished
EOF
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    create) create_vm ;;
    start) cmd_start ;;
    stop) cmd_stop ;;
    destroy) destroy_vm ;;
    recreate) destroy_vm; create_vm ;;
    status) cmd_status ;;
    shell) cmd_shell ;;
    ssh) cmd_ssh "$@" ;;
    ip) cmd_ip ;;
    ondemand) cmd_ondemand ;;
    ""|-h|--help|help) usage ;;
    *) echo "unknown: $cmd" >&2; usage; exit 1 ;;
  esac
}

main "$@"
