#!/usr/bin/env bash
# Recreate-friendly Ubuntu Server VM for Hackploy local VPS testing (VirtualBox).
# Usage: ./vbox-ubuntu.sh create|start|stop|destroy|recreate|status|ssh|ip
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CACHE="${HACKPLOY_VBOX_CACHE:-$HOME/.cache/hackploy-vbox}"
VM_NAME="${VM_NAME:-hackploy-ubuntu}"
VM_DIR="${VM_DIR:-$CACHE/vms/$VM_NAME}"
CPUS="${CPUS:-4}"
MEM_MB="${MEM_MB:-4096}"
DISK_GB="${DISK_GB:-40}"
# bridged = LAN IP (custom domain). Override with NET_MODE=nat if needed.
NET_MODE="${NET_MODE:-bridged}"
BRIDGE_NIC="${BRIDGE_NIC:-wlp0s20f3}"
SSH_PORT="${SSH_PORT:-2222}"
HTTP_PORT="${HTTP_PORT:-8080}"
SSH_PUBKEY="${SSH_PUBKEY:-$HOME/.ssh/id_ed25519.pub}"
HOSTNAME="${HOSTNAME_GUEST:-hackploy}"
USER_NAME="${USER_NAME:-ubuntu}"
UBUNTU_RELEASE="${UBUNTU_RELEASE:-24.04}"
IMAGE_NAME="ubuntu-${UBUNTU_RELEASE}-server-cloudimg-amd64.img"
IMAGE_URL="${IMAGE_URL:-https://cloud-images.ubuntu.com/releases/${UBUNTU_RELEASE}/release/${IMAGE_NAME}}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1" >&2; exit 1; }; }

ensure_tools() {
  need VBoxManage
  need qemu-img
  need xorriso
  need curl
}

vm_exists() {
  VBoxManage showvminfo "$VM_NAME" >/dev/null 2>&1
}

vm_state() {
  VBoxManage showvminfo "$VM_NAME" --machinereadable 2>/dev/null | awk -F= '/^VMState=/{gsub(/"/,"",$2); print $2}'
}

download_image() {
  mkdir -p "$CACHE/images"
  local img="$CACHE/images/$IMAGE_NAME"
  if [[ -f "$img" ]]; then
    echo "image cached: $img"
    return
  fi
  echo "downloading Ubuntu ${UBUNTU_RELEASE} cloud image…"
  curl -fL --progress-bar -o "$img.partial" "$IMAGE_URL"
  mv "$img.partial" "$img"
}

build_seed_iso() {
  local seed_dir="$1" out_iso="$2"
  mkdir -p "$seed_dir"
  if [[ ! -f "$SSH_PUBKEY" ]]; then
    echo "SSH public key not found: $SSH_PUBKEY" >&2
    echo "Create one: ssh-keygen -t ed25519" >&2
    exit 1
  fi
  local pubkey
  pubkey="$(cat "$SSH_PUBKEY")"

  cat >"$seed_dir/meta-data" <<EOF
instance-id: ${VM_NAME}
local-hostname: ${HOSTNAME}
EOF

  cat >"$seed_dir/user-data" <<EOF
#cloud-config
hostname: ${HOSTNAME}
manage_etc_hosts: true
users:
  - name: ${USER_NAME}
    groups: [sudo, adm]
    shell: /bin/bash
    sudo: ALL=(ALL) NOPASSWD:ALL
    lock_passwd: true
    ssh_authorized_keys:
      - ${pubkey}
ssh_pwauth: false
package_update: true
packages:
  - qemu-guest-agent
  - curl
  - ca-certificates
runcmd:
  - systemctl enable --now qemu-guest-agent || true
  - echo "hackploy-ubuntu ready" > /etc/motd
final_message: "Hackploy Ubuntu cloud-init finished"
EOF

  rm -f "$out_iso"
  xorriso -as mkisofs -output "$out_iso" -volid cidata -joliet -rock \
    "$seed_dir/user-data" "$seed_dir/meta-data" >/dev/null 2>&1
}

prepare_disk() {
  mkdir -p "$VM_DIR"
  local src="$CACHE/images/$IMAGE_NAME"
  local vdi="$VM_DIR/disk.vdi"
  rm -f "$vdi"
  echo "cloning disk (dynamic VDI, ${DISK_GB}G virtual — not preallocated)…"
  # static=off → grow-as-used; only cloud image size is written now
  qemu-img convert -O vdi -o static=off "$src" "$vdi"
  # expand virtual capacity only (thin); does not allocate ${DISK_GB}G on host
  VBoxManage modifymedium disk "$vdi" --resize "$((DISK_GB * 1024))"
  qemu-img info "$vdi" | awk '/^(virtual size|disk size):/'
}

create_vm() {
  ensure_tools
  if vm_exists; then
    echo "VM already exists: $VM_NAME (destroy first or use recreate)" >&2
    exit 1
  fi
  download_image
  prepare_disk
  local seed_iso="$VM_DIR/cidata.iso"
  build_seed_iso "$VM_DIR/seed" "$seed_iso"

  echo "creating VM $VM_NAME…"
  VBoxManage createvm --name "$VM_NAME" --ostype "Ubuntu_64" --register --basefolder "$VM_DIR"
  VBoxManage modifyvm "$VM_NAME" \
    --memory "$MEM_MB" \
    --cpus "$CPUS" \
    --firmware efi \
    --vram 16 \
    --rtcuseutc on \
    --audio-driver none \
    --clipboard-mode bidirectional \
    --graphicscontroller vmsvga

  VBoxManage storagectl "$VM_NAME" --name "VirtIO" --add virtio --controller VirtIO
  VBoxManage storageattach "$VM_NAME" --storagectl "VirtIO" --port 0 --device 0 \
    --type hdd --medium "$VM_DIR/disk.vdi"
  VBoxManage storagectl "$VM_NAME" --name "IDE" --add ide
  VBoxManage storageattach "$VM_NAME" --storagectl "IDE" --port 0 --device 0 \
    --type dvddrive --medium "$seed_iso"

  if [[ "$NET_MODE" == "nat" ]]; then
    VBoxManage modifyvm "$VM_NAME" --nic1 nat
    VBoxManage modifyvm "$VM_NAME" --natpf1 "ssh,tcp,127.0.0.1,${SSH_PORT},,22"
    VBoxManage modifyvm "$VM_NAME" --natpf1 "http,tcp,127.0.0.1,${HTTP_PORT},,8080"
    echo "network: NAT  ssh → 127.0.0.1:${SSH_PORT}  http → 127.0.0.1:${HTTP_PORT}"
  else
    VBoxManage modifyvm "$VM_NAME" --nic1 bridged --bridgeadapter1 "$BRIDGE_NIC"
    echo "network: bridged on $BRIDGE_NIC"
  fi

  VBoxManage startvm "$VM_NAME" --type headless
  echo
  echo "VM started. First boot runs cloud-init (~1–2 min)."
  echo "  wait for DHCP, then: ./vbox-ubuntu.sh ip && ./vbox-ubuntu.sh ssh"
  if [[ "$NET_MODE" == "nat" ]]; then
    echo "  ssh -p ${SSH_PORT} ${USER_NAME}@127.0.0.1"
  fi
}

destroy_vm() {
  ensure_tools
  if ! vm_exists; then
    echo "no VM named $VM_NAME"
    rm -rf "$VM_DIR"
    return
  fi
  local st
  st="$(vm_state || true)"
  if [[ "$st" == "running" || "$st" == "paused" ]]; then
    echo "powering off…"
    VBoxManage controlvm "$VM_NAME" poweroff || true
    sleep 2
  fi
  echo "deleting VM…"
  VBoxManage unregistervm "$VM_NAME" --delete || true
  rm -rf "$VM_DIR"
  echo "gone."
}

cmd_ssh() {
  local opts=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR)
  if [[ "$NET_MODE" == "bridged" ]]; then
    local ip
    ip="$(guest_ip || true)"
    if [[ -z "${ip:-}" ]]; then
      echo "no guest IP yet (cloud-init / DHCP still running?)" >&2
      exit 1
    fi
    exec ssh "${opts[@]}" "${USER_NAME}@${ip}" "$@"
  fi
  exec ssh "${opts[@]}" -p "$SSH_PORT" "${USER_NAME}@127.0.0.1" "$@"
}

guest_ip() {
  VBoxManage guestproperty get "$VM_NAME" /VirtualBox/GuestInfo/Net/0/V4/IP 2>/dev/null \
    | awk -F': ' '/Value:/{print $2}'
}

cmd_ip() {
  if ! vm_exists; then
    echo "VM missing" >&2
    exit 1
  fi
  if [[ "$NET_MODE" == "nat" ]]; then
    echo "NAT mode — use 127.0.0.1:${SSH_PORT} (ssh) and 127.0.0.1:${HTTP_PORT} (http)"
    return
  fi
  local ip
  ip="$(guest_ip || true)"
  if [[ -z "${ip:-}" || "$ip" == "0.0.0.0" ]]; then
    echo "IP not ready yet (need guest additions/agent + DHCP). Retry in a bit." >&2
    exit 1
  fi
  echo "$ip"
}

cmd_status() {
  if ! vm_exists; then
    echo "missing"
    exit 0
  fi
  echo "name=$VM_NAME state=$(vm_state) mode=$NET_MODE"
  if [[ "$NET_MODE" == "nat" ]]; then
    echo "ssh=${USER_NAME}@127.0.0.1:${SSH_PORT}"
  else
    echo "ip=$(guest_ip || echo pending)"
  fi
}

usage() {
  cat <<EOF
Usage: $0 <command>

  create     download cloud image (once), create + start VM
  start      start existing VM headless
  stop       ACPI shutdown (or poweroff)
  destroy    delete VM + disk (keeps cached Ubuntu image)
  recreate   destroy + create
  status     show state
  ssh        ssh into the guest
  ip         print guest IP (bridged) or NAT ports

Env (optional):
  VM_NAME NET_MODE=nat|bridged BRIDGE_NIC CPUS MEM_MB DISK_GB
  SSH_PORT HTTP_PORT SSH_PUBKEY USER_NAME HOSTNAME_GUEST

Examples:
  $0 create
  BRIDGE_NIC=enp62s0 $0 recreate
  NET_MODE=nat $0 recreate
  $0 destroy
EOF
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    create) create_vm ;;
    start)
      ensure_tools
      VBoxManage startvm "$VM_NAME" --type headless
      ;;
    stop)
      ensure_tools
      VBoxManage controlvm "$VM_NAME" acpipowerbutton 2>/dev/null \
        || VBoxManage controlvm "$VM_NAME" poweroff
      ;;
    destroy) destroy_vm ;;
    recreate) destroy_vm; create_vm ;;
    status) cmd_status ;;
    ssh) cmd_ssh "$@" ;;
    ip) cmd_ip ;;
    ""|-h|--help|help) usage ;;
    *) echo "unknown: $cmd" >&2; usage; exit 1 ;;
  esac
}

main "$@"
