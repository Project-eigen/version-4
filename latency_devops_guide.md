# DawaiSathi — Latency Elimination Guide (DevOps Team)

> Structured from **highest to lowest impact**. Work top to bottom. Each fix is independently deployable.

---

## 📊 Latency Breakdown: Where Time Is Actually Lost

Before fixing anything, understand where user-perceived latency comes from:

```
User opens app (cold start on Render free tier)
├── DNS lookup                         ~5–20ms    (can't fix this)
├── TCP handshake to Render            ~80–250ms  (Singapore fix: -150ms)
├── Render cold start (free tier)      ~15–60s    ← BIGGEST PROBLEM
├── Gunicorn worker boot               ~200ms
├── DB connection to Supabase          ~100–300ms (pooler fixes this)
├── Flask route processing             ~5–50ms
└── Response serialization             ~1–5ms

User scans prescription
├── Image upload to Flask              ~200–800ms (mobile 4G)
├── Cloudinary upload from Flask       ~400–1200ms (Singapore: -300ms)
├── Gemini API call (Flash)            ~2–8s      ← SECOND BIGGEST PROBLEM
└── JSON response to frontend          ~10–20ms

User opens cabinet
├── API call to /cabinet               ~50–200ms  (DB query)
├── Cloudinary image delivery          ~30–150ms  (CDN cache hit)
└── React render                       ~10–30ms
```

---

## 🚨 Priority 0 — Render Cold Start (The 60-Second Problem)

### What's happening
Render's free tier spins down services after 15 minutes of inactivity. The next user gets a **15–60 second cold start** while Gunicorn boots, DB connects, and the app initialises. This is the single worst user experience in the entire app.

### Fix 1: External Keep-Alive Ping (Free, 5 minutes to implement)

Use any free cron service to ping the health endpoint every 5 minutes:

**Option A — UptimeRobot (recommended, free)**
1. Go to [uptimerobot.com](https://uptimerobot.com)
2. Add monitor → HTTP(S) → URL: `https://dawaisathi-api.onrender.com/`
3. Interval: 5 minutes
4. This is free and pings every 5 minutes — Render never spins down

**Option B — cron-job.org (free)**
1. [cron-job.org](https://cron-job.org) → New cron job
2. URL: `https://dawaisathi-api.onrender.com/`
3. Schedule: `*/5 * * * *`

**Option C — GitHub Actions (free, keeps it in your repo)**
```yaml
# .github/workflows/keep-alive.yml
name: Keep Render Alive
on:
  schedule:
    - cron: '*/5 * * * *'
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl -fsS https://dawaisathi-api.onrender.com/ || true
```

> **Expected improvement:** Eliminates cold starts entirely. First user after any gap gets response in ~300ms instead of ~60s.

---

### Fix 2: Upgrade Render Plan (Paid, $7/month)

Render's Starter plan ($7/month) keeps the service always-on. No spin-down, no cold start. If you have any paying users, this is worth it immediately.

---

## 🌏 Priority 1 — Geography: Move to Singapore Region

### The problem
DawaiSathi is deployed in Render's **Oregon (US West)** region by default. Your users are in India. Every API call crosses ~14,000km:

```
Mumbai → Oregon: ~280ms round-trip
Mumbai → Singapore: ~80ms round-trip
Difference: ~200ms per API call
```

For a medicine logging action that makes 3 API calls, that's **600ms of pure geography tax**.

### Fix: Redeploy to Render Singapore Region

1. In Render dashboard → your service → **Settings**
2. **Region** → Change to `Singapore (Southeast Asia)`
3. Click **Save** → Render triggers a redeploy

**Also move Supabase to Singapore:**
- Supabase → Project Settings → General
- When creating a new project, select `Southeast Asia (Singapore)`
- For existing projects: create new Supabase project in Singapore, migrate data

> **Expected improvement:** -150 to -200ms per API call. Cumulative UX improvement is significant.

---

## 🗄️ Priority 2 — Database Latency

### Fix 1: Add Missing Index on `medicine_entries.created_at`

The cabinet query `ORDER BY created_at DESC` does a full table scan without this index. At 100+ medicines, this becomes noticeable.

Add to `backend/models.py` in `MedicineEntry.__table_args__`:

```python
__table_args__ = (
    db.Index('idx_medicine_user_id', 'user_id'),
    db.Index('idx_medicine_family_id', 'family_id'),
    db.Index('idx_medicine_created_at', 'created_at'),  # ADD THIS
)
```

Then run:
```sql
-- Run once on your Supabase SQL editor
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medicine_created_at
ON medicine_entries (created_at DESC);
```

> **Expected improvement:** Cabinet load time -30 to -100ms at scale.

---

### Fix 2: Supabase Connection Pooling — Verify You're Using PgBouncer

Check your `DATABASE_URL`. It should end with `:6543` (PgBouncer pooler), not `:5432` (direct connection):

```
# CORRECT — PgBouncer transaction mode pooler
postgresql://user:pass@db.xxx.supabase.com:6543/postgres

# WRONG — Direct connection, fails under Render's multiple workers
postgresql://user:pass@db.xxx.supabase.com:5432/postgres
```

Why this matters: Render runs Gunicorn with multiple workers. Each worker needs its own DB connection. Direct Supabase connections are limited to ~20 simultaneous. PgBouncer pools them, and your config.py already handles this correctly with `pool_size=3, max_overflow=2` when `:6543` is detected.

---

### Fix 3: Add Index on `medicine_logs.logged_at` + composite

The cabinet API fetches today's logs with a date range filter on `logged_at`. Under load, this query does a full scan:

```sql
-- Run on Supabase SQL editor
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_med_log_entry_date
ON medicine_logs (entry_id, logged_at DESC);

-- Also helps the notification scheduler
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notif_log_date
ON notification_logs (user_id, date, time_slot);
```

---

## ⚡ Priority 3 — Gemini API Latency (2–8 second scan wait)

This is the most user-perceived latency in the app. The AI scan wait (2–8s) is where users give up.

### Fix 1: Stream the Gemini Response (Show Progress Immediately)

Instead of waiting for the full Gemini response before returning anything, use streaming to show the user it's working:

**Backend (`medicine.py`):**
```python
# Instead of:
response = model.generate_content([SCAN_PROMPT, img_for_gemini])

# Use streaming:
response = model.generate_content(
    [SCAN_PROMPT, img_for_gemini],
    stream=True,
    generation_config={"response_mime_type": "application/json"}
)
response.resolve()  # Wait for completion but stream allows timeout detection
```

### Fix 2: Optimise Gemini Model Parameters

```python
model = genai.GenerativeModel(
    "gemini-2.5-flash",
    generation_config=genai.GenerationConfig(
        temperature=0.1,        # Lower = more deterministic, faster
        top_p=0.8,
        max_output_tokens=2048, # Cap output tokens — prescriptions don't need 8192 tokens
        response_mime_type="application/json",  # Ask for JSON directly — skips markdown parsing
    )
)
```

### Fix 3: Progressive Loading UX (Instant Perceived Response)

While Gemini processes, don't show a blank spinner. Show a step-by-step progress animation:

```
Step 1: "📤 Uploading prescription..."     (immediate)
Step 2: "🔍 Reading prescription..."       (after upload)
Step 3: "💊 Extracting medicines..."       (after 1s)
Step 4: "✅ Found 4 medicines!"            (on completion)
```

This makes the 4-second wait feel like 1 second to users.

**Implementation in `Scanner.tsx`:**
```tsx
const SCAN_STEPS = [
  { msg: '📤 Uploading prescription...', delay: 0 },
  { msg: '🔍 Reading prescription...', delay: 800 },
  { msg: '💊 Extracting medicines...', delay: 2000 },
  { msg: '🧠 Analysing dosages...', delay: 4000 },
]
```

---

## 🖼️ Priority 4 — Cloudinary CDN Optimisation

### Fix 1: Use Cloudinary Transformations for Auto-Optimised Delivery

Currently you upload fixed JPEG files. Cloudinary can serve WebP to modern browsers automatically, which is 25–35% smaller:

```python
# In cloudinary_utils.py, update upload_image_bytes:
import cloudinary
import cloudinary.uploader

def upload_image_bytes(image_bytes: bytes, folder: str = "dawaisathi") -> str:
    result = cloudinary.uploader.upload(
        image_bytes,
        folder=folder,
        resource_type="image",
        format="auto",          # Serve WebP to browsers that support it
        quality="auto:good",    # Cloudinary auto-optimises quality
        fetch_format="auto",    # Format negotiation via Accept header
    )
    return result["secure_url"]
```

### Fix 2: Use Cloudinary Image Transformation URLs in Frontend

Instead of serving fixed-size images, use Cloudinary's URL transformation to deliver exactly the right size:

```typescript
// In frontend/src/api/client.ts or a utils file
export function getCloudinaryUrl(url: string, width: number): string {
  if (!url || !url.includes('cloudinary.com')) return url
  // Insert transformation: w_{width},c_limit,f_auto,q_auto
  return url.replace('/upload/', `/upload/w_${width},c_limit,f_auto,q_auto/`)
}
```

Then in `Cabinet.tsx`:
```tsx
// Medicine thumbnail: 80px wide max
<img src={getCloudinaryUrl(med.pack_image_url, 80)} />
```

> **Expected improvement:** 25–50% faster image loading on mobile networks.

---

## 🚀 Priority 5 — Frontend Bundle Performance

### Fix 1: Verify Code-Splitting Is Working

Your `App.tsx` already uses `lazy()` for all pages — this is correct. Verify the build output:

```bash
cd frontend && npm run build
# Check dist/assets/ — each page should be a separate chunk < 200KB
```

### Fix 2: Add `<link rel="preconnect">` for Third-Party Domains

Add to `frontend/index.html` before other `<link>` tags:

```html
<!-- Preconnect to API backend for faster first call -->
<link rel="preconnect" href="https://dawaisathi-api.onrender.com">
<!-- Preconnect to Cloudinary for faster image loads -->
<link rel="preconnect" href="https://res.cloudinary.com">
<!-- Preconnect to Google Fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```

> **Expected improvement:** First API call -50 to -100ms (connection already established by browser).

### Fix 3: Add `loading="lazy"` and `decoding="async"` to All Images

```tsx
// Ensure all medicine card images have these attributes
<img
  src={getImageUrl(med.pack_image_url)}
  alt={med.name}
  loading="lazy"
  decoding="async"
  width={64}
  height={64}
/>
```

This ensures off-screen images don't block the main thread during cabinet rendering.

### Fix 4: PWA Precaching — Verify Critical Assets Are Precached

The Workbox service worker precaches JS/CSS at install time. Verify `vite.config.ts` workbox config includes all critical routes:

```typescript
// vite.config.ts workbox section should have:
workbox: {
  globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
  navigateFallback: 'index.html',
  runtimeCaching: [/* your existing config */]
}
```

---

## 🔧 Priority 6 — Gunicorn Worker Configuration

### Current: `Procfile`
```
web: gunicorn app:create_app() --workers 2 --threads 4 --worker-class gthread
```

### Optimised for Render's free tier (512MB RAM):
```
web: gunicorn "app:create_app()" --workers 2 --threads 4 --worker-class gthread --timeout 120 --keep-alive 5 --max-requests 1000 --max-requests-jitter 100 --log-level info
```

Key changes:
- `--timeout 120`: Gemini scan can take up to 8s; default 30s would kill it
- `--keep-alive 5`: Reuse HTTP connections from Nginx/Render's proxy
- `--max-requests 1000`: Restart workers after 1000 requests to prevent memory leaks
- `--max-requests-jitter 100`: Stagger restarts so not all workers restart simultaneously

---

## 📈 Priority 7 — Advanced (When You Hit Scale)

### Redis for Notification Queue (1,000+ Users)

Current architecture: `Cron → /trigger-check → synchronous push loop`

Problem: At 1,000 users all with 8am doses, the cron webhook blocks while sending 1,000 push notifications sequentially. Render worker times out. Notifications are missed.

**Solution: Celery + Redis task queue**

```python
# Instead of synchronous loop in scheduler.py:
for user in users_to_notify:
    send_push_notification(user, slot)  # Blocks for each user

# Use Celery:
for user in users_to_notify:
    send_push_task.delay(user.id, slot)  # Enqueues immediately, returns

# Worker sends in parallel
@celery.task
def send_push_task(user_id: int, slot: str):
    user = User.query.get(user_id)
    send_push_notification(user, slot)
```

**Infrastructure:**
- Render Redis add-on: $10/month
- Add Celery worker: separate Render service, $7/month
- Total cost: $17/month for reliable 10k+ user notification delivery

---

### FastAPI Migration (10,000+ MAU)

Flask's synchronous workers limit concurrent request handling. FastAPI with async SQLAlchemy handles 3–5x more concurrent requests with the same hardware.

**Migration path:**
1. Start with FastAPI for new endpoints only (auth-less ones: `/healthz`, `/`)
2. Gradually migrate route files as you add features
3. Full migration when Flask becomes a bottleneck (unlikely before 10k users)

**Not worth doing now.** Flask is fine for 5,000 users.

---

## 📊 Expected Impact Summary

| Fix | Effort | Latency Saved | When |
|---|---|---|---|
| Keep-alive ping (UptimeRobot) | 5 min | -15 to -60s (cold start) | Today |
| Singapore region move | 30 min | -150 to -200ms per call | Today |
| Render keep-alive plan upgrade | $7/month | Eliminates cold starts | Today |
| `preconnect` link tags in HTML | 10 min | -50 to -100ms first call | Today |
| Cloudinary `f_auto,q_auto` | 30 min | -25-50% image load time | This week |
| DB indexes (SQL) | 15 min | -30 to -100ms cabinet load | This week |
| Supabase verify :6543 pooler | 15 min | -100ms under load | This week |
| Gunicorn flags update | 5 min | Prevents scan timeouts | This week |
| Gemini `max_output_tokens=2048` | 5 min | -500ms to -2s scan time | This week |
| Progressive scan loading UX | 2 hours | -Perceived 2s (same actual) | This sprint |
| Redis + Celery notification queue | 3 days | Reliable at 1,000+ users | Month 3 |

---

## 🔍 Monitoring Setup (Required — Flying Blind Without This)

### Sentry (Backend) — Free

```python
# backend/app.py — add before create_app()
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration

sentry_sdk.init(
    dsn="https://YOUR_DSN@sentry.io/PROJECT_ID",
    integrations=[FlaskIntegration()],
    traces_sample_rate=0.1,   # 10% of requests traced for performance
    profiles_sample_rate=0.1,
)
```

### Custom Latency Logging (Zero-Cost)

Add to every slow route so you can see latency in Render logs:

```python
import time

@medicine_bp.route("/api/medicine/scan", methods=["POST"])
def scan_medicine():
    t0 = time.time()
    # ... existing code ...
    
    # Before return:
    elapsed = time.time() - t0
    current_app.logger.info(f"[PERF] scan_medicine: {elapsed:.2f}s (upload:{upload_time:.2f}s gemini:{gemini_time:.2f}s)")
```

Render Logs tab lets you search for `[PERF]` to see actual production latency numbers.

---

## Checklist for DevOps Team

### Do Today (< 2 hours total)
- [ ] Set up UptimeRobot keep-alive ping at `dawaisathi-api.onrender.com` every 5 min
- [ ] Change Render region to Singapore (Service → Settings → Region)
- [ ] Add `<link rel="preconnect">` tags to `frontend/index.html`
- [ ] Update Procfile with optimised Gunicorn flags
- [ ] Verify `DATABASE_URL` uses port `:6543` (PgBouncer, not direct)

### Do This Week
- [ ] Run CREATE INDEX statements on Supabase SQL editor
- [ ] Update Cloudinary upload to use `format="auto", quality="auto:good"`
- [ ] Add Gemini `max_output_tokens=2048` + `response_mime_type="application/json"`
- [ ] Add Sentry to backend
- [ ] Add `[PERF]` timing logs to scan + cabinet routes

### Do Before 1,000 Users
- [ ] Move Supabase project to Singapore region
- [ ] Upgrade Render to Starter plan ($7/month) — no more cold starts
- [ ] Implement progressive scan loading UX

### Do Before 5,000 Users
- [ ] Evaluate Redis + Celery for notification queue
- [ ] Add CDN for frontend (Cloudflare free tier in front of Render)
