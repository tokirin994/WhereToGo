#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo on a fresh Ubuntu 24.04 VM.' >&2; exit 1; }
source /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 ]] || { echo 'This installer targets Ubuntu 24.04 only.' >&2; exit 1; }
if command -v docker >/dev/null; then
  echo 'Docker already installed; keep it and install only age/rclone and utilities.'
  apt-get update
else
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl --proto '=https' --tlsv1.2 -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  arch="$(dpkg --print-architecture)"
  printf 'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: noble\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/docker.asc\n' "$arch" >/etc/apt/sources.list.d/docker.sources
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
apt-get install -y git python3 age rclone curl ca-certificates unattended-upgrades
systemctl enable --now docker
echo 'Installed server tools. This script does not alter SSH or cloud firewall rules and does not add users to the root-equivalent docker group.'
echo 'Allow 80/443 and restrict SSH to your own IP in the OCI network security group before deployment.'
