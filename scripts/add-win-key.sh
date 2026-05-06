#!/bin/bash
set -e

WIN_KEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINkIWuFG+UVv07Uoxvv/8JND13THoe69TGR7UxdRD7fF win-chexian"
AUTH="/home/deployer/.ssh/authorized_keys"

# 移除旧的 Windows key 条目(历次尝试留下的)
sed -i '/windows-chexian-deploy/d' "$AUTH"
sed -i '/windows-chexian-rsa/d' "$AUTH"
sed -i '/win-chexian/d' "$AUTH"

# 写入新 key
echo "$WIN_KEY" >> "$AUTH"

# 修权限
chmod 600 "$AUTH"
chown deployer:deployer "$AUTH"

# 修 TCP Wrappers:允许所有 IP 连 sshd
grep -q "sshd: ALL" /etc/hosts.allow || echo "sshd: ALL" >> /etc/hosts.allow

echo "=== authorized_keys ==="
cat "$AUTH"
echo "=== hosts.allow ==="
cat /etc/hosts.allow
echo "=== DONE ==="
