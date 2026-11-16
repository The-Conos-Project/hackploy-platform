#!/usr/bin/env bash
# Ubuntu VM for Hackploy local VPS testing via Multipass (CLI only).
# Usage: ./multipass-ubuntu.sh create|start|stop|destroy|recreate|status|ssh|ip|shell
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

ensure() {
  need multipass
  if multipass list >/dev/null 2>&1; then
    return
  fi
  # daemon often needs a moment after first install / reboot
  snap start multipass >/dev/null 2>&1 || true
  local i
  for i in $(seq 1 30); do
    if multipass list >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done
  echo "multipassd not ready — try: sudo snap restart multipass" >&2
  exit 1
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

  # No custom cloud-init: Multipass already injects your SSH key; snap also
  # rejects many paths / complex user-data. Keep launch simple.
  local args=(launch "$IMAGE" --name "$VM_NAME" --cpus "$CPUS" --memory "$MEM" --disk "$DISK")
  if [[ -n "$BRIDGE_NIC" ]]; then
    args+=(--network "name=${BRIDGE_NIC},mode=auto")
    echo "extra NIC: bridged on $BRIDGE_NIC"
  fi

  echo "launching $VM_NAME ($CPUS / $MEM / $DISK, image=$IMAGE)…"
  multipass "${args[@]}"

  echo
  echo "Ready. CLI only:"
  echo "  ./multipass-ubuntu.sh shell"
  echo "  ./multipass-ubuntu.sh ssh"
  echo "  ./multipass-ubuntu.sh ip"
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
  exec multipass exec "$VM_NAME" -- sudo -u ubuntu -i
}

cmd_shell() {
  ensure
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
# multipass json: {"info":{"name":{...}}}
inst=next(iter(info.values())) if isinstance(info,dict) else {}
ips=inst.get("ipv4") or []
print("\n".join(ips) if ips else "pending")
'
}

cmd_status() {
  ensure
  if ! vm_exists; then
    echo "missing"
    exit 0
  fi
  multipass info "$VM_NAME"
}

usage() {
  cat <<EOF
Usage: $0 <command>

  create     launch Ubuntu via Multipass
  start      start stopped VM
  stop       stop VM
  destroy    delete VM
  recreate   destroy + create
  status     show info
  shell      multipass shell (easiest)
  ssh        login as ubuntu
  ip         print IPv4 address(es)

Env (optional):
  VM_NAME CPUS MEM DISK IMAGE=24.04 BRIDGE_NIC

Examples:
  $0 create
  BRIDGE_NIC=wlp0s20f3 $0 recreate
  $0 shell
  $0 destroy
EOF
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    create) create_vm ;;
    start)
      ensure
      multipass start "$VM_NAME"
      ;;
    stop)
      ensure
      multipass stop "$VM_NAME"
      ;;
    destroy) destroy_vm ;;
    recreate) destroy_vm; create_vm ;;
    status) cmd_status ;;
    shell) cmd_shell ;;
    ssh) cmd_ssh "$@" ;;
    ip) cmd_ip ;;
    ""|-h|--help|help) usage ;;
    *) echo "unknown: $cmd" >&2; usage; exit 1 ;;
  esac
}

main "$@"
