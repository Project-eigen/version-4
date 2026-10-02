#!/usr/bin/env bash
# ==============================================================================
# DawaiSathi Google Cloud VPS Automated Deployment & SSL Setup Script
# Target Domain: dawaisathi.georbit.org
# ==============================================================================

set -e

DOMAIN="dawaisathi.georbit.org"
EMAIL="admin@georbit.org"

echo "======================================================================"
echo " Starting DawaiSathi VPS Automated Deployment for ${DOMAIN}"
echo "======================================================================"

# 1. Verify sudo/root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root or with sudo: sudo bash vps_setup.sh"
  exit 1
fi

# 2. Update System Packages
echo "[1/7] Updating system packages..."
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release ufw openssl

# 3. Install Docker & Docker Compose if not installed
if ! command -v docker &> /dev/null; then
  echo "[2/7] Installing Docker Engine & Docker Compose Plugin..."
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  echo "[+] Docker installed successfully."
else
  echo "[2/7] Docker is already installed."
fi

# 4. Configure Firewall (UFW)
echo "[3/7] Configuring UFW Firewall for Ports 22, 80, 443..."
ufw allow 22/tcp || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw --force enable || true

# 5. Prepare Environment Configuration (.env)
echo "[4/7] Setting up environment configuration..."
if [ ! -f .env ]; then
  if [ -f .env.production ]; then
    echo "[*] Using pre-configured .env.production..."
    cp .env.production .env
  elif [ -f .env.production.example ]; then
    echo "[*] Creating .env from .env.production.example..."
    cp .env.production.example .env
  fi
  echo "[+] Environment configuration loaded."
else
  echo "[*] Existing .env file detected, preserving current settings."
fi

# 6. Prepare Certbot & Nginx Directories with Self-Healing SSL Bootstrap
echo "[5/7] Preparing SSL & Nginx challenge directories..."
mkdir -p "certbot/conf/live/${DOMAIN}" certbot/www
mkdir -p nginx/conf.d

# Clean up any leftover duplicate config files
rm -f nginx/conf.d/default.conf nginx/conf.d/dawaisathi-init.conf

# If no certificate exists yet, generate temporary dummy certificate so Nginx boots cleanly
if [ ! -f "certbot/conf/live/${DOMAIN}/fullchain.pem" ]; then
  echo "[*] Creating temporary self-signed SSL certificate so Nginx boots safely..."
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "certbot/conf/live/${DOMAIN}/privkey.pem" \
    -out "certbot/conf/live/${DOMAIN}/fullchain.pem" \
    -subj "/CN=${DOMAIN}" > /dev/null 2>&1
fi

# 7. Start Full Production Stack
echo "[6/7] Launching all services (PostgreSQL, Backend API, Frontend, Nginx, Certbot)..."
docker compose down || true
docker compose up -d

# 8. Request / Upgrade to Official Let's Encrypt Certificate
echo "[7/7] Requesting official Let's Encrypt SSL certificate for ${DOMAIN}..."
docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
  --email ${EMAIL} \
  -d ${DOMAIN} \
  --rsa-key-size 4096 \
  --agree-tos \
  --force-renewal \
  --non-interactive" certbot || echo "[!] Notice: Let's Encrypt challenge had an issue, Nginx remains active."

# Reload Nginx to apply fresh certificate
docker compose exec -T nginx nginx -s reload 2>/dev/null || docker compose restart nginx

# Wait 5 seconds for backend to start then ensure Ultimate Admin ayaan is synced
sleep 5
echo "[*] Initializing Ultimate Admin account 'ayaan'..."
docker compose exec -T backend python manage_admin.py setup-ultimate --password "AyaanLoveBlueBug" || true

echo "======================================================================"
echo "[SUCCESS] DawaiSathi is live on your Google Cloud VPS!"
echo "======================================================================"
echo " Website URL:     https://${DOMAIN}"
echo " Admin Portal:    https://${DOMAIN}/admin"
echo ""
echo " 👑 ULTIMATE ADMIN CREDENTIALS:"
echo "   Username:      ayaan"
echo "   Password:      AyaanLoveBlueBug"
echo ""
echo " Database:        PostgreSQL 16 (Running directly on VPS)"
echo ""
echo " To monitor logs in real time:"
echo "   docker compose logs -f"
echo "======================================================================"
