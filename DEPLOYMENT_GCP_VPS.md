# 🚀 DawaiSathi — Google Cloud VPS Deployment Guide

Complete step-by-step instructions to deploy **DawaiSathi** on a **Google Cloud Compute Engine VM (VPS)** under the domain **`dawaisathi.georbit.org`**, with the **database hosted entirely on the VPS**, and an **interactive Superuser Admin Section** for database management.

---

## 📋 Architecture Overview

- **Domain**: `dawaisathi.georbit.org` (Subdomain on `georbit.org`)
- **VPS Host**: Google Cloud Compute Engine (Ubuntu 22.04 / 24.04 LTS)
- **Database**: PostgreSQL 16 self-hosted on the VPS with persistent disk volume
- **Backend API**: Flask / Gunicorn running under Python 3.11
- **Frontend App**: React 19 PWA with Single Page App routing & Service Worker
- **Reverse Proxy**: Nginx with HTTP/2 and auto-renewing Let's Encrypt SSL (Certbot)
- **Admin Section**: Full database interaction and superuser management panel at `/admin`

---

## 🛠️ Step 1: Create Google Cloud Compute Engine VM

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Navigate to **Compute Engine** > **VM instances**.
3. Click **Create Instance**:
   - **Name**: `dawaisathi-vps`
   - **Region**: Choose the region closest to your users (e.g., `asia-south1` for Mumbai/Delhi, or `us-central1`).
   - **Machine type**: `e2-small` (2 vCPU, 2 GB RAM) or `e2-medium` (recommended for production).
   - **Boot disk**: Click *Change* > Choose **Ubuntu 22.04 LTS** or **Ubuntu 24.04 LTS**, Disk size: **25 GB - 30 GB** (Standard Persistent Disk).
   - **Firewall**: Check both:
     - ✅ **Allow HTTP traffic**
     - ✅ **Allow HTTPS traffic**
4. Click **Create**.

### Assign a Static External IP (Crucial)
1. In the GCP search bar, go to **VPC network** > **IP addresses**.
2. Find the external IP assigned to `dawaisathi-vps`.
3. Click the three dots on the right > **Promote to static IP address**.
4. Name it `dawaisathi-ip` and save. Copy this IP address (e.g. `34.xxx.xxx.xxx`).

---

## 🌐 Step 2: Configure DNS for `dawaisathi.georbit.org`

In your domain registrar where **`georbit.org`** was purchased (e.g. GoDaddy, Namecheap, Cloudflare, Hostinger, Squarespace, or Google Domains):

1. Go to the **DNS Management / DNS Records** page for `georbit.org`.
2. Add a new **A Record**:
   - **Type**: `A`
   - **Name / Host**: `dawaisathi` (some DNS providers ask for `dawaisathi.georbit.org`)
   - **Value / Points to**: Your GCP VM Static External IP (from Step 1)
   - **TTL**: `Auto` or `300 seconds` (5 minutes)
3. Save the record.
4. Verify DNS propagation on your local machine or terminal:
   ```bash
   ping dawaisathi.georbit.org
   # or
   nslookup dawaisathi.georbit.org
   ```
   *(It should resolve to your GCP VM external IP).*

---

## 💻 Step 3: Connect to your VPS and Clone the Code

1. In the Google Cloud Console VM Instances list, click **SSH** next to `dawaisathi-vps` to open the terminal.
2. Clone the repository from GitHub:
   ```bash
   git clone https://github.com/Project-Eigen/version-4.git dawaisathi
   cd dawaisathi
   ```

---

## ⚡ Step 4: Run the Automated VPS Deployment Script

We have created an automated setup script `vps_setup.sh` that takes care of Docker installation, firewall rules, Let's Encrypt SSL issuance, and launching the entire stack:

```bash
chmod +x vps_setup.sh
sudo bash vps_setup.sh
```

### What this script does automatically:
1. Installs Docker and Docker Compose.
2. Configures UFW firewall for ports **22** (SSH), **80** (HTTP), and **443** (HTTPS).
3. Generates a production `.env` file with secure random keys.
4. Obtains a free, auto-renewing **Let's Encrypt SSL certificate** for `dawaisathi.georbit.org`.
5. Starts the self-hosted **PostgreSQL database**, **Backend API**, **Frontend React PWA**, and **Nginx proxy**.

---

## 🔑 Step 5: Configure Production API Keys

Edit your `.env` file on the VPS to add your real API keys (Gemini for OCR, Google OAuth, Cloudinary, Telegram):

```bash
nano .env
```

Review or fill in the following:

```env
# ── Domain & URLs ───────────────────────────────────────────────────────────
FRONTEND_URL=https://dawaisathi.georbit.org
GOOGLE_REDIRECT_URI=https://dawaisathi.georbit.org/api/auth/callback
TELEGRAM_WEBHOOK_URL=https://dawaisathi.georbit.org

# ── Superuser Admin Credentials ─────────────────────────────────────────────
ADMIN_SECRET_KEY=your_custom_admin_master_secret_key
ADMIN_EMAILS=admin@georbit.org,your_email@gmail.com

# ── AI Prescription OCR ─────────────────────────────────────────────────────
GEMINI_API_KEY=your_gemini_api_key_here

# ── Google OAuth (Google Cloud Console) ──────────────────────────────────────
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret

# ── Cloudinary (Prescription Scan Storage) ──────────────────────────────────
CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>

# ── Telegram Bot (Optional) ─────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

After modifying `.env`, restart the backend container:
```bash
docker compose up -d backend
```

---

## 🔐 Step 6: Configure Google OAuth Credentials

If you use Google OAuth Sign-In:
1. Go to [Google Cloud Console > APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials).
2. Edit your **OAuth 2.0 Client ID**:
   - **Authorized JavaScript origins**:
     - `https://dawaisathi.georbit.org`
   - **Authorized redirect URIs**:
     - `https://dawaisathi.georbit.org/api/auth/callback`
3. Click **Save**.

---

## 👑 Step 7: Log in as the Ultimate Admin (Ayaan)

You have pre-configured **Ultimate Admin** access with exclusive master permissions:
- **Username**: `ayaan`
- **Password**: `AyaanLoveBlueBug`
- **Privilege Level**: **👑 Ultimate Administrator**
  - **Exclusivity**: Only Ayaan has the ultimate power to assign other users as Administrators or remove their admin privileges.
  - **Protection**: Ayaan's account cannot be demoted or deleted by any other administrator.

### How to Log In to the Admin Section:
1. Open your browser and navigate to:
   ```
   https://dawaisathi.georbit.org/admin
   ```
2. In the **👑 Ayaan / Admin Login** tab:
   - **Username or Email**: `ayaan`
   - **Password**: `AyaanLoveBlueBug`
3. Click **Authenticate Superuser**.
4. You will see the **👑 ULTIMATE ADMIN** badge in your top navbar.

---

## 🎛️ Step 8: How to Assign and Remove Other Admins

From your **Users & Roles** tab (`https://dawaisathi.georbit.org/admin`):
1. **Assign an Admin**: Find any user in the table and click **Assign Admin**. That user immediately gains administrator access to manage medicines, logs, and database records.
2. **Remove an Admin**: Click **Demote Admin** next to any administrator. They will instantly lose all admin privileges and return to being a regular user.
3. **Delete an User/Admin**: Only Ayaan can delete other administrator accounts.
4. **Ultimate Admin Exclusivity**: Other assigned admins who log into the portal *cannot* promote or demote anyone, and they *cannot* modify or delete your account. Only Ayaan retains this power!

Once logged in at `https://dawaisathi.georbit.org/admin`:

1. **Overview & KPIs**:
   - Live database connection status (Localhost PostgreSQL 16).
   - Real-time counts: Total users, active users today, medicines tracked, adherence logs, prescription scans.
   - One-click **Run DB Cleanup** to purge old guest accounts and stale logs.
   - One-click **Export Full JSON Backup** to download the entire database as a JSON backup file.

2. **User Management**:
   - Live search across all users by name or email.
   - One-click toggle to **Promote to Superuser** or **Demote**.
   - **Reset Password** for any user.
   - **Delete User** with automated cascade deletion of medicines, logs, and join requests.

3. **Medicines & Prescriptions**:
   - Browse all medicines in the entire database.
   - Search by medicine name, dosage, or instructions.
   - Edit medicine details, schedules, and pill stock counts in real time.
   - Delete corrupt or unwanted entries.

4. **Prescription Scans & OCR**:
   - View uploaded prescription images.
   - Inspect raw AI OCR JSON payloads extracted from scans.

5. **Families & Circles**:
   - View family circles, member counts, and invite codes.
   - Dissolve families if needed.

6. **Interactive SQL Console**:
   - Direct SQL query runner on the VPS PostgreSQL database!
   - Execute queries like:
     ```sql
     SELECT id, name, email, is_superuser, created_at FROM users;
     SELECT * FROM medicine_entries ORDER BY created_at DESC LIMIT 20;
     SELECT count(*) FROM medicine_logs;
     ```
   - Formatted table viewer with query latency and row counts.

---

## 🛠️ Handy VPS Management Commands

### Check Container Status
```bash
docker compose ps
```

### View Live Logs
```bash
# All logs
docker compose logs -f

# Backend only
docker compose logs -f backend

# Nginx access & error logs
docker compose logs -f nginx
```

### Restart Application
```bash
docker compose restart
```

### Pull Code Updates from GitHub
Whenever you push updates to GitHub, update your VPS in seconds:
```bash
cd dawaisathi
git pull origin main
docker compose up -d --build
```

### Direct PostgreSQL CLI Access (psql)
```bash
docker compose exec db psql -U dawaisathi -d dawaisathi
```

### Database Backup & Restore
**Create a backup dump:**
```bash
docker compose exec db pg_dump -U dawaisathi dawaisathi > backup_$(date +%F).sql
```

**Restore a backup dump:**
```bash
cat backup_file.sql | docker compose exec -T db psql -U dawaisathi -d dawaisathi
```

---

## 🔒 SSL Certificate Auto-Renewal
The `certbot` container runs automatically in the background and attempts renewal every 12 hours. Certificates are automatically reloaded by Nginx.

To test SSL renewal manually:
```bash
docker compose run --rm certbot renew --dry-run
```
