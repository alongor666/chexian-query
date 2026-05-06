#!/bin/bash
# setup-https-share.sh — 在 VPS 上开启 HTTPS 文件下载服务
# 必须以 root 运行(VNC 控制台或 sudo)
# 给 chexian.cretvalu.com 加一个 /data/ location,带 Basic Auth,可下载 parquet。

set -e

DATA_DIR="/var/www/chexian/server/data"
HTPASSWD_FILE="/etc/nginx/.chexian-data-htpasswd"
NGINX_CONF="/etc/nginx/conf.d/chexian.conf"
USERNAME="chexian-data"
PASSWORD_FILE="/root/.chexian-data-password"

if [ "$EUID" -ne 0 ]; then
    echo "错误:需要 root 权限。请在 VNC 控制台或 sudo 运行。"
    exit 1
fi

if [ ! -d "$DATA_DIR" ]; then
    echo "错误:数据目录不存在 $DATA_DIR"
    exit 1
fi

# === 1/5: 生成或复用密码 ===
if [ -f "$PASSWORD_FILE" ]; then
    PASSWORD=$(cat "$PASSWORD_FILE")
    echo "[1/5] 复用已有密码($PASSWORD_FILE)"
else
    PASSWORD=$(openssl rand -base64 18 | tr -d '+/=' | head -c 24)
    echo "$PASSWORD" > "$PASSWORD_FILE"
    chmod 600 "$PASSWORD_FILE"
    echo "[1/5] 已生成新密码并保存到 $PASSWORD_FILE"
fi

# === 2/5: 写 htpasswd(用 openssl,不依赖 httpd-tools)===
HASH=$(openssl passwd -apr1 "$PASSWORD")
echo "$USERNAME:$HASH" > "$HTPASSWD_FILE"
chmod 644 "$HTPASSWD_FILE"
echo "[2/5] 写入 htpasswd $HTPASSWD_FILE"

# === 3/5: 在 nginx 配置里插入 /data/ location ===
if grep -q "location /data/" "$NGINX_CONF"; then
    echo "[3/5] /data/ location 已存在,跳过插入"
else
    BACKUP="${NGINX_CONF}.bak.$(date +%s)"
    cp "$NGINX_CONF" "$BACKUP"
    echo "[3/5] 已备份原配置到 $BACKUP"

    # 在 ssl_dhparam 行后面插入 location 块
    sed -i '/ssl_dhparam.*managed by Certbot/a\
\
    # === Parquet 数据下载(由 setup-https-share.sh 添加)===\
    location /data/ {\
        alias /var/www/chexian/server/data/;\
        autoindex on;\
        autoindex_format json;\
        autoindex_exact_size on;\
        autoindex_localtime on;\
        auth_basic "Chexian Data";\
        auth_basic_user_file /etc/nginx/.chexian-data-htpasswd;\
        add_header X-Content-Type-Options "nosniff" always;\
        client_max_body_size 0;\
    }' "$NGINX_CONF"
    echo "[3/5] 已在 nginx 配置里插入 /data/ location"
fi

# === 4/5: 测试 nginx 配置 ===
if ! nginx -t; then
    echo "错误:nginx 配置测试失败,请检查 $NGINX_CONF"
    exit 1
fi
echo "[4/5] nginx 配置测试通过"

# === 5/5: 重载 nginx ===
systemctl reload nginx
echo "[5/5] nginx 已重载"

# === 输出 ===
echo ""
echo "============================================================"
echo "✅ HTTPS 数据下载服务已就绪"
echo ""
echo "  URL:       https://chexian.cretvalu.com/data/"
echo "  Username:  $USERNAME"
echo "  Password:  $PASSWORD"
echo ""
echo "  Win 端 .env 配置:"
echo "    HTTPS_BASE_URL=https://chexian.cretvalu.com/data/"
echo "    HTTPS_USER=$USERNAME"
echo "    HTTPS_PASS=$PASSWORD"
echo ""
echo "  自测命令(VPS 本机):"
echo "    curl -u '$USERNAME:$PASSWORD' https://chexian.cretvalu.com/data/"
echo "============================================================"
