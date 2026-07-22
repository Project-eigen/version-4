# DawaiSathi -  Commercial Launch TODO

> Track progress here. Work top to bottom. Do not skip sprints.

> `[ ]` = todo  |  `[/]` = in progress  |  `[x]` = done

-

## SPRINT 0 -  Blockers (Do Before Anything Else)

> Nothing ships until these are checked off. Estimated: 2- 3 days.

### Critical Bug Fixes

- [x] **Bug 10** -  Fixed (already correct in v4.1: uses `logged_by_user_id`)

  `backend/routes/auth.py` L154

  Change `MedicineLog.user_id`  -> `MedicineLog.logged_by_user_id`

- [ ] **Bug 12** -  Fix ScanApproval crash on direct URL / notification click

  `frontend/src/pages/ScanApproval.tsx` top of component

  Add `if (!state -> .scanData) { navigate('/scan', { replace: true }); return null }`

- [ ] **Bug 8** -  Fix orphaned Family row when last member leaves

  `backend/routes/family.py` L167- 182

  Check remaining member count; delete Family if count === 0

- [ ] **Bug 11** -  Fix expired medicines staying in cabinet forever

  `backend/routes/medicine.py` L237

  Add SQLAlchemy filter: `created_at + days >= current_date` OR `days IS NULL`

### Cost Protection (Do Same Day as Bug Fixes)

- [ ] **Rate limit the scan endpoint** -  without this, one user can cost you Rs.10,000+ in Gemini fees

  `backend/routes/medicine.py` -  add `@limiter.limit("10 per hour")` on `/scan` route

### Minor Code Quality (30 mins total)

- [ ] **Bug 15** -  Fix N+1 query in `User.to_dict()`

  `backend/models.py` L75

  Change `lazy="dynamic"` to `lazy=True`, use `len(self.push_subscriptions) > 0`

- [ ] **Bug 14** -  Delete dead duplicate function

  `backend/routes/auth.py` L18- 19

  Remove unused `generate_family_code()` -  only `family.py` version is correct

-

##  -> SPRINT 1 -  Foundation & Trust Layer

> Everything needed before showing the app to real users. Estimated: 1- 2 weeks.

### Security

- [ ] Add `Cache-Control: no-store` header on all `/api/auth/*` endpoints

  `backend/routes/auth.py`

- [ ] Confirm JWT is NOT exposed in URL on OAuth redirect (Bug 9)

  Verify exchange-cookie flow is active; test with browser history after login

### Infrastructure

- [ ] Move Render deployment to Singapore region (saves ~600ms for Indian users)

- [ ] Set Render keep-alive ping every 5 minutes

  Add UptimeRobot or cron.job.io hitting `https://dawaisathi-api.onrender.com/`

- [ ] Add DB index on `medicine_entries.created_at`

  `backend/models.py` -  add `db.Index('idx_medicine_created_at', 'created_at')` in `__table_args__`

### Observability

- [ ] Set up Sentry on backend (free tier)

  `pip install sentry-sdk[flask]` -> add to `app.py` before routes register

- [ ] Set up Sentry on frontend

  `npm install @sentry/react` -> wrap `App.tsx` with `Sentry.init`

- [ ] Add Google Analytics 4 to frontend

  Add GA4 script to `frontend/index.html` + fire custom events on: scan, log, family-join

### Legal (Required for Play Store + Trust)

- [ ] Write Privacy Policy -  cover data collected, Gemini API usage, Cloudinary storage

  Host at `dawaisathi.com/privacy`

- [ ] Write Terms of Service -  include medical disclaimer

  Host at `dawaisathi.com/terms`

### Brand & Acquisition

- [ ] Build landing page at `dawaisathi.com`

  Above-the-fold: headline + scan demo GIF + "Try Free" CTA

  Below: 3 feature tiles (AI Scan, Family Cabinet, Smart Reminders)

  Bottom: Privacy + Terms links

-

## SPRINT 2 -  Core Sticky Features

> Features that make users come back daily and tell friends. Estimated: 3- 4 weeks.

### 2A -  Swipe-to-Log (UX Upgrade)

- [x] Replace 400ms hold gesture with swipe-right gesture in `Cabinet.tsx`

  Use framer-motion drag: `drag="x"`, `dragConstraints={{ left: 0, right: 80 }}`

  Trigger log when `info.offset.x > 60` in `onDragEnd`

- [x] Keep click-to-log for desktop -  already working, preserve it

- [x] Add subtle swipe hint arrow on first cabinet visit (store dismissal in `localStorage`)

### 2B -  Dose Logging Confirmation Animation

- [x] Install `canvas-confetti` (~1.5KB gzipped): `npm install canvas-confetti`

- [x] Fire micro-confetti burst on successful dose log in `Cabinet.tsx`

- [x] Green checkmark morphs in with spring animation (framer-motion)

- [x] Streak counter increments with a bounce

### 2C -  Adherence Streak Counter

- [x] Add streak calculation to backend -  new endpoint `GET /api/medicine/streak`

  Logic: count consecutive days where all scheduled doses were logged

- [x] Display streak in Cabinet header: `- 7-day streak`

  Animate increment when user logs a dose

- [x] Missed dose banner: "You missed Evening dose yesterday -  tap to log anyway"

  Show if yesterday has unlogged doses; backend: `GET /api/medicine/missed`

### 2D -  Shareable Weekly Adherence Card (Viral Loop)

- [x] Friday push notification: "Your week in review -  tap to see your report"

- [x] `/report` page: renders shareable card showing week's adherence %

  Use `html2canvas` or Canvas API to generate PNG

- [x] "Share" button  -> Web Share API (`navigator.share`)  -> WhatsApp, Instagram, etc.

- [x] Card design: DawaiSathi logo + adherence % + streak + week range

### 2E -  WhatsApp Notifications

- [ ] Sign up for Meta Cloud API (free) OR Twilio WhatsApp sandbox (instant, free for dev)

- [ ] Add `whatsapp_phone` field to `User` model in `backend/models.py`

- [ ] New section in `SettingsDashboard.tsx`: "WhatsApp Reminders"

  Input: phone number  -> sends verification code  -> user confirms

- [ ] Add WhatsApp channel to `scheduler.py` alongside existing push/Telegram

  Keep Telegram as secondary fallback -  do not remove it

- [ ] Message format: "Time for your EVENING medicines: Aspirin, Metformin. Open app: [link]"

### 2F -  Onboarding Wizard (3 screens)

- [x] Add `onboarding_done` flag to `localStorage` (check in `AuthContext.tsx`)

- [x] Build `Onboarding.tsx` page with 3 slides using framer-motion `AnimatePresence`

  Slide 1: App intro + value prop (completed)

  Slide 2: "Scan your first prescription" (completed) -  direct CTA to `/scan`

  Slide 3: "Enable reminders" (completed) -  direct CTA to notification settings

- [x] Add route `/onboarding` in `App.tsx`, redirect new users here after first login

- [x] "Skip for now" option on each slide

### 2G -  Refill Tracker

- [x] Add `quantity` column to `MedicineEntry` model: `db.Column(db.Integer, nullable=True)`

- [x] Add migration: `ALTER TABLE medicine_entries ADD COLUMN quantity INTEGER`

- [x] Expose `quantity` field in ScanApproval + EditMedicineModal

  `frontend/src/pages/ScanApproval.tsx` + `frontend/src/components/EditMedicineModal.tsx`

- [ ] Backend job: daily check -  if `quantity / doses_per_day <= 7 days`, fire alert

  Add to `scheduler.py` alongside dose reminder logic

- [ ] Alert: "Your Metformin runs out in 5 days -  time to refill"

-

## SPRINT 3 -  Growth & Monetization

> After soft launch, once you have real user data. Estimated: 4- 6 weeks.

### 3A -  Prescription History Archive

- [x] New DB table `PrescriptionScan`: `id, user_id, cloudinary_url, medicines_json, scanned_at`

- [x] On every successful scan, save record to this table

- [x] New page `History.tsx` -  list of past scans, reverse chronological

  Each card: prescription thumbnail + extracted medicine count + date

- [x] "Re-add" button -  navigates to ScanApproval with pre-filled medicines

- [x] Add "History" tab to bottom nav

### 3B -  Medicine Info Card (AI-powered)

- [x] On long-press of medicine name in Cabinet, show bottom sheet

- [x] Sheet calls `POST /api/medicine/info` with `{ name: "Metformin" }`

- [x] Backend: Gemini prompt for 2- 3 sentence plain-language explanation

  Always append: "Always follow your doctor's instructions."

- [x] Cache result in `localStorage` keyed by medicine name (avoid repeat API calls)

### 3C -  Dark Mode

- [x] Add CSS custom property overrides under `[data-theme="dark"]` in `index.css`

  Invert bg/text/border tokens; keep glassmorphism with darker base

- [x] Toggle in `SettingsDashboard.tsx` -  store in `localStorage`

- [x] Auto-detect on first load: `window.matchMedia('(prefers-color-scheme: dark)')`

### 3D -  Remote Caregiver Mode

- [ ] Design "guardian" role in family -  can view + manage another member's cabinet

- [ ] DB: add `role` column to user- family relationship (`member | guardian | owner`)

- [ ] Frontend: caregiver sees "Managing: [Parent's name]" banner + member switcher

- [ ] Push alerts to caregiver when family member misses a dose

- [ ] Scope this separately before building -  it is a major feature

### 3E -  Freemium + Razorpay

- [ ] Define exact feature gates (Free / Plus Rs.99 / Family Rs.199)

- [ ] Add `plan` column to `User` model: `free | plus | family`

- [ ] Integrate Razorpay backend SDK: `pip install razorpay`

  Routes: `POST /api/billing/create-order` + `POST /api/billing/verify`

- [ ] Upgrade prompt shown when free user hits limit (10th medicine, 5th scan/month)

- [ ] Subscription management page in `SettingsDashboard.tsx`

### 3F -  Hindi Language Support

- [x] Integrate i18next: `npm install i18next react-i18next`

- [x] Extract all UI strings into `en.json` + `hi.json` translation files

- [x] Language toggle in settings: English | Hindi

- [x] Update Gemini scan prompt to handle Hindi/Devanagari prescriptions

### 3G -  Pharmacy Partner Integration

- [ ] Add "Refill" button on medicine cards (only when quantity is tracked)

- [ ] Deep-link to 1mg: `https://www.1mg.com/search/all -> name={medicineName}`

- [ ] Track click events in GA4 (affiliate tracking starts here)

- [ ] Long-term: negotiate revenue share with 1mg / PharmEasy / Netmeds

-

## FUTURE -  Infrastructure (Only When You Hit Scale)

> Do not build these until 5,000+ MAU. Premature optimization kills startups.

- [ ] Add Redis + Celery for notification queue (replaces synchronous cron trigger)

- [ ] Migrate Flask  -> FastAPI (only if throughput is a real bottleneck at 10k+ users)

- [ ] Add client-side image compression (`browser-image-compression` npm)

- [ ] Tablet layout: CSS grid breakpoint at 768px for two-column Cabinet view

- [ ] Capacitor wrapper  -> Google Play Store listing

- [ ] HealthKit / Google Health Connect integration (requires Capacitor or React Native)

-

## Week-by-Week Schedule

| Week | Target | Sprint |

|-|-|-|

| **Week 1** | Fix all 7 items in Sprint 0 | S0 |

| **Week 2** | Sentry + GA4 + keep-alive + DB index + security | S1 |

| **Week 3** | Landing page + Privacy Policy + Terms of Service | S1 |

| **Week 4** | Swipe-to-log + dose confirmation animation | S2 |

| **Week 5** | Streak counter + missed dose banner | S2 |

| **Week 6** | Shareable weekly adherence card (viral loop) | S2 |

| **Week 7** | WhatsApp notifications | S2 |

| **Week 8** | Onboarding wizard + refill tracker | S2 |

| **- Week 8** | **SOFT LAUNCH -  invite 100 beta users** | -  |

| **Week 9** | Prescription history archive | S3 |

| **Week 10** | Hindi language support | S3 |

| **Week 11** | Freemium model + Razorpay | S3 |

| **- Week 12** | **PUBLIC LAUNCH -  Product Hunt India** | -  |

