# Hayat Interiors — WhatsApp Lead Manager

An internal lead-automation & management system for **Hayat Interiors**. The
admin (Mr. Siddique) imports leads from a CSV, sends a personalized WhatsApp
template campaign to every contact, and collects + manages their responses from
a secure dashboard. Customers reply through a public form — no login required.

Built with **Next.js (App Router) · TypeScript · Tailwind CSS · Supabase ·
WhatsApp Business Cloud API (Meta)**.

---

## ✨ Features

| Area | What it does |
| --- | --- |
| 🔐 **Auth** | Supabase email/password auth. The entire dashboard is protected by middleware; unauthenticated users are redirected to `/login`. |
| 📥 **CSV import** | Upload a CSV of `name, phone`, preview parsed rows with validation, then import. Duplicate phone numbers are skipped automatically. |
| 💬 **WhatsApp campaigns** | Send a Meta template message to all contacts — personalized name, predefined header image, and a per-customer form link. Per-message status is stored. |
| 📝 **Public form** | A no-login form (`/form/<token>`) pre-filled from the contact. Captures interest, requirements & notes. Resubmissions update the existing response. |
| 📊 **Dashboard** | Overview stats: total contacts, messages sent, interested / not-interested / pending, total responses. |
| 🧮 **Leads management** | Searchable, filterable, paginated table of all responses with a one-tap WhatsApp "click to chat" follow-up button. |
| 📈 **Campaign history** | Tracks campaign date, contact count, sent/failed counts and delivery status (updated live via webhook). |

---

## 🧱 Tech stack & structure

```
app/
  (admin)/                 # Protected dashboard route group
    layout.tsx             #   server-side auth gate + sidebar shell
    dashboard/page.tsx     #   overview statistics
    contacts/page.tsx      #   CSV import + contacts list
    campaigns/page.tsx     #   send campaign + history
    leads/page.tsx         #   responses table (filter / search / paginate)
  form/                    # PUBLIC customer form (no auth)
    [token]/page.tsx
  login/                   # Admin login + sign-in/out server actions
  api/
    contacts/upload/       #   POST  CSV import        (admin)
    campaigns/send/        #   POST  send WhatsApp      (admin)
    stats/                 #   GET   dashboard stats    (admin)
    responses/             #   POST  form submission    (public, service role)
    webhook/               #   GET/POST WhatsApp webhook (public)
components/                # Reusable UI + feature components
lib/
  supabase/                # browser / server / admin / middleware clients
  config · types · phone · csv · validation · whatsapp · stats · utils · auth
middleware.ts              # session refresh + route protection
supabase/schema.sql        # database schema + RLS (run this in Supabase)
```

---

## 🚀 Setup

### 0. Prerequisites
- Node.js 18.18+ (tested on Node 22)
- A free [Supabase](https://supabase.com) project
- A [Meta / WhatsApp Business](https://developers.facebook.com) app (for sending)

### 1. Install

```bash
npm install
```

### 2. Configure Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and **Run**.
   This creates the `profiles`, `contacts`, `campaigns`, `messages`,
   `responses` tables with indexes, triggers and Row Level Security.
3. Create your admin login: **Authentication → Users → Add user** → enter an
   email + password and tick **Auto Confirm User**. (A `profiles` row is created
   automatically by a trigger.)
4. Grab your keys from **Project Settings → API**:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY` *(keep secret!)*

### 3. Configure WhatsApp (Meta Cloud API)

1. In [developers.facebook.com](https://developers.facebook.com), create / open
   your app → add the **WhatsApp** product.
2. Copy the **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID` and a
   **permanent access token** → `WHATSAPP_ACCESS_TOKEN`.
   (Use a *System User* token for production — temporary tokens expire in 24h.)
3. **Create the message template** in *WhatsApp Manager → Templates* exactly as
   below, then submit for approval:

   | Part | Type | Content |
   | --- | --- | --- |
   | **Header** | Image | (sample image — the real one is sent at runtime) |
   | **Body** | Text | `Hi {{1}},`<br>`Thank you for your interest in Hayat Interiors.`<br>`Please fill the following form.` |
   | **Button** | URL (Dynamic) | Base: `https://YOUR-DOMAIN/form/` · variable `{{1}}` |

   - Name it `hayat_interiors_intro` (or set `NEXT_PUBLIC_WHATSAPP_TEMPLATE_NAME`).
   - `{{1}}` in the body = customer name. `{{1}}` on the button = the form token,
     which the app appends so each customer gets their own pre-filled link.
   - If your template has **no** header image, leave
     `NEXT_PUBLIC_WHATSAPP_IMAGE_URL` empty and the app omits it.

### 4. Environment variables

```bash
cp .env.example .env.local
# then edit .env.local with your real values
```

See the full reference in **[Environment variables](#-environment-variables)**.

### 5. Run

```bash
npm run dev          # http://localhost:3000
```

Visit `http://localhost:3000` → you'll be sent to `/login`. Sign in with the
admin user you created.

---

## 📄 CSV format

The importer accepts a header row (auto-detected) **or** plain
`name,phone` columns:

```csv
Customer Name,Phone Number
Aarav Sharma,+91 98765 43210
Priya Patel,09876543210
Hayat Client,919876500000
```

- Local numbers without a country code get `NEXT_PUBLIC_DEFAULT_COUNTRY_CODE`
  prepended (default `91`). A leading `+` is treated as a full international
  number.
- Invalid / duplicate rows are reported in the preview and skipped on import.

---

## 🔗 How the flow works

```
CSV upload ──▶ contacts (unique phone + form token)
campaign send ──▶ WhatsApp template per contact ──▶ messages (status)
                                  │
customer taps button ──▶ /form/<token> (pre-filled) ──▶ /api/responses
                                  │
                          responses (interested / not) ──▶ dashboard & leads
WhatsApp delivery updates ──▶ /api/webhook ──▶ messages.status (delivered/read)
```

Public submissions never touch the database directly — they go through the
`/api/responses` route which uses the **service role** key, so Row Level
Security stays fully locked down.

---

## 🪝 WhatsApp webhook (optional but recommended)

Live delivery/read status requires a webhook:

1. Deploy the app (so it has a public URL), or use a tunnel (e.g. `ngrok`) in dev.
2. In your Meta app → **WhatsApp → Configuration → Webhook**:
   - **Callback URL:** `https://YOUR-DOMAIN/api/webhook`
   - **Verify token:** the value of `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   - Subscribe to the **`messages`** field.

The `GET /api/webhook` handler answers Meta's verification challenge; the
`POST` handler updates `messages.status` by matching the WhatsApp message id.

---

## ☁️ Deployment (Vercel)

1. Push this folder to a Git repository.
2. Import it into [Vercel](https://vercel.com) (framework auto-detected as Next.js).
3. Add **all** environment variables from `.env.local` in
   *Project → Settings → Environment Variables*. Set
   `NEXT_PUBLIC_APP_URL` to your production URL (e.g. `https://hayat.vercel.app`).
4. Deploy. Then point the WhatsApp webhook + template button base URL at the
   production domain.

> **Sending at scale:** campaign sending runs in a serverless function
> (`maxDuration = 60s`, 5 concurrent sends). For very large lists (thousands),
> split into multiple campaigns or move sending to a background queue / cron.

Works on any Node host (`npm run build && npm start`).

---

## 🔑 Environment variables

| Variable | Scope | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** | Service role key — public form & sending. Bypasses RLS. |
| `NEXT_PUBLIC_APP_URL` | public | Deployment base URL (builds the form link) |
| `WHATSAPP_ACCESS_TOKEN` | **secret** | Meta Cloud API access token |
| `WHATSAPP_PHONE_NUMBER_ID` | **secret** | Meta phone number id |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | secret | WABA id (reference) |
| `WHATSAPP_API_VERSION` | secret | Graph API version, e.g. `v21.0` |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | **secret** | Your chosen webhook verify token |
| `NEXT_PUBLIC_WHATSAPP_TEMPLATE_NAME` | public | Approved template name |
| `NEXT_PUBLIC_WHATSAPP_TEMPLATE_LANG` | public | Template language code, e.g. `en` |
| `NEXT_PUBLIC_WHATSAPP_IMAGE_URL` | public | Predefined header image (public https URL) |
| `NEXT_PUBLIC_DEFAULT_COUNTRY_CODE` | public | Default dialing code for local numbers |

---

## 🛡️ Security notes

- The admin dashboard and admin APIs are protected by `middleware.ts` **and** a
  server-side `auth.getUser()` check in the protected layout / routes.
- All tables have **Row Level Security** enabled. Only authenticated admins can
  read/write via the anon key; anonymous users have no table access.
- The `service_role` key is used **only** in server route handlers
  (`/api/responses`, `/api/campaigns/send`, `/api/webhook`) and the form
  pre-fill lookup — never exposed to the browser (`lib/supabase/admin.ts` is
  marked `server-only`).
- The public form has a honeypot field for basic bot protection.

---

## 📜 Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
#   h a y a t - l e a d s  
 #   h a y a t - l e a d s  
 