#!/usr/bin/env bash
# fix-ssh-on-vps.sh — 一次性修复 VPS 上 Windows 中转机 SSH 握手问题
#
# 用法(在 VPS 上以 root 跑):
#   curl -sL https://raw.githubusercontent.com/alongor666/chexian-query/main/scripts/fix-ssh-on-vps.sh | sudo bash
#
# 做的事:
#   1. 解封 67.216.201.23(Win 中转机公网 IP)
#   2. 把 windows-chexian-deploy 和 windows-chexian-rsa 两个公钥加到 deployer
#   3. 把 67.216.201.23 加 fail2ban 白名单
#   4. 验证 sshd 配置
#
# 公钥说明:本脚本写死了某用户 Windows 中转机的两个公钥(ed25519 + rsa)。
# 公钥是公开信息,无安全敏感性。

set -e

WIN_IP="67.216.201.23"

echo ""
echo "=== 1. fail2ban 当前状态 ==="
fail2ban-client status sshd || echo "(fail2ban 未运行或 sshd jail 不存在)"

echo ""
echo "=== 2. 解封 ${WIN_IP} ==="
fail2ban-client set sshd unbanip "${WIN_IP}" 2>&1 || echo "(IP 不在封禁列表,跳过)"

echo ""
echo "=== 3. 加两个公钥到 deployer/.ssh/authorized_keys(去重)==="
sudo -u deployer bash << 'INNER'
set -e
mkdir -p ~/.ssh && chmod 700 ~/.ssh
touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys

K1='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJWBw54+ZDn8MxeKsjVc9qcZOck6/3L8lfF2yR/HSztl windows-chexian-deploy'
K2='ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQClDOmzuqkq/KaNlgTJIu0d0vPqSPJeAccAH5PyRMP2AubmIq9qSIGyXLwRYLfUj1rv55QIFVO5p4AhQF+5MkXHdvYQ9zmFPUYRlAhs9DDino62hPnIHlC6vMVZdr6014JHYYEtmigcVsYC2FP1zNdfIdGlaspRDYBKRnwBxgJq8DFs+LzPxOgwhyko+yui1PqHGL2hxU+uxXDakRVAl+xidm1SsbsKpDXE5h6zCBWH22fRce8L+AcWQtleOb3m6M1f3McdVfneEi///X/nO5qlSptsAtFzlnGL+JCHWRLcyrZZhYitYF6uml5hoxaXFuyFuypdtW0Xs7Pce/qKKUxnTVzXM+Enn5o1+rv2Oklt5wxxFv4szgNlNaJb93x7qc+Lk94bk5272vTK328gatyBYyDlkL/u1L+rbOHx+ScrOqtfoNbry82SlvZ1uED3PU1eVDc7BljuGeEDulAN4IeLpN7mV2wMfJgmulTZA0TECLcpPzxSI47CcPu0WX0oR2K2+GED4ROeRn5/ldlG4Qh9WQsf22bzOOmDnquSQ1BaSRifXMv5SLIOVvNj80AXbWmu33NfbR81mD2AYeSFklpA1tcmfpPMqNUklqBiYUvJdYBmEKVRMZM7rS2oVpe0oxCGAGt/NLl4NNl27cj7fabCWp49fUHgL+eILfV6+3BGAw== windows-chexian-rsa'

grep -qF "windows-chexian-deploy" ~/.ssh/authorized_keys || echo "$K1" >> ~/.ssh/authorized_keys
grep -qF "windows-chexian-rsa"    ~/.ssh/authorized_keys || echo "$K2" >> ~/.ssh/authorized_keys

echo "--- authorized_keys 行数 ---"
wc -l ~/.ssh/authorized_keys
echo "--- 末两行 ---"
tail -2 ~/.ssh/authorized_keys
INNER

echo ""
echo "=== 4. sshd 配置检查 ==="
grep -E "^(PubkeyAuthentication|AuthorizedKeysFile|AllowUsers|PasswordAuthentication)" /etc/ssh/sshd_config \
  || echo "(未找到显式配置项,使用 sshd 默认值,默认允许 pubkey)"

echo ""
echo "=== 5. 加 ${WIN_IP} 到 fail2ban 白名单(防再次被封)==="
cat > /etc/fail2ban/jail.d/whitelist.local << EOF
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1 ${WIN_IP}
EOF
fail2ban-client reload && echo "白名单已生效" || echo "(reload 失败,但封禁已解除,可继续测试)"

echo ""
echo "=== ✅ 全部完成 ==="
echo "回 Win 端跑: ssh -vvv -p 22 deployer@162.14.113.44"
echo "看到 'Authentication succeeded' 即成功"
