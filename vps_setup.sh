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

# 6. Prepare Certbot & Nginx Directories
echo "[5/7] Preparing SSL & Nginx challenge directories..."
mkdir -p certbot/conf certbot/www
mkdir -p nginx/conf.d

# If no certificate exists yet, bootstrap with HTTP-only config first
if [ ! -d "certbot/conf/live/${DOMAIN}" ]; then
  echo "[*] Initializing HTTP bootstrap config for Let's Encrypt verification..."
  cp nginx/conf.d/dawaisathi-init.conf nginx/conf.d/default.conf

  echo "[*] Launching Nginx for HTTP ACME challenge..."
  docker compose up -d nginx

  echo "[6/7] Requesting Let's Encrypt SSL certificate for ${DOMAIN}..."
  docker compose run --rm --entrypoint "\
    certbot certonly --webroot -w /var/www/certbot \
    --email ${EMAIL} \
    -d ${DOMAIN} \
    --rsa-key-size 4096 \
    --agree-tos \
    --force-renewal \
    --non-interactive" certbot

  echo "[+] SSL Certificate successfully issued!"
  echo "[*] Switching to full HTTPS production configuration..."
  cp nginx/conf.d/dawaisathi.conf nginx/conf.d/default.conf
else
  echo "[6/7] SSL certificate already exists for ${DOMAIN}."
  cp nginx/conf.d/dawaisathi.conf nginx/conf.d/default.conf
fi

# 7. Start Full Production Stack
echo "[7/7] Launching all services (PostgreSQL, Backend API, Frontend, Nginx, Certbot)..."
docker compose down || true
docker compose up -d --build

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
