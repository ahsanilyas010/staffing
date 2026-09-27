# Assorted Staffing — Project Context

> Hand this file to a new chat session to resume work without losing context.

---

## What This Is

A monorepo for Assorted Staffing containing:

1. **Public staffing website** — `index.html` at repo root, deployed to `staffing.assorted.group` on Vercel
2. **Recruitment HRM + Hiring Automation platform** — `hrm/` subdirectory, deployed to `hrm.assorted.group` on Vercel (Next.js 14 App Router). This is now a full hiring automation system: AI voice screening, self-scheduling, offers/e-sign onboarding, and staff augmentation (client portal, bench search, placements, timesheets) — not just a pipeline tracker.

GitHub repo: `ahsanilyas010/staffing`
Mirror HRM repo: `ahsanilyas010/hrmsystems` (identical to `hrm/` — kept in sync)

Full spec: `hrm/HIRING_MODULE_SPEC.md` (all 6 phases implemented as of this writing).

---

## Tech Stack

| Layer | Tech |
|---|---|
| Database + Auth | Supabase (project ID: `wqgjzeussogxoetispzq`), pgvector enabled |
| File storage | Supabase Storage — `cvs`, `offers`, `onboarding` (all private except CV upload path) |
| HRM frontend | Next.js 14, App Router, Tailwind CSS, shadcn/ui |
| Auth method | **Supabase Auth only** — `signInWithPassword`, SSR with `@supabase/ssr`. Two separate auth flows: HR (`/login` → `hr_users`) and client portal (`/client/login` → `client_users`) |
| Voice | Vapi.ai (multilingual EN/UR screening calls) |
| Messaging | Twilio (SMS + WhatsApp, WhatsApp falls back to SMS pre-Meta-verification) |
| Email | Resend |
| LLM scoring | Anthropic API (call transcript extraction/scoring) |
| Embeddings | OpenAI-compatible (`text-embedding-3-small`, 1536-dim) for semantic bench search |
| Calendar | Google Calendar API (Meet links for video interviews) |
| PDF | `@react-pdf/renderer` (offer letters) |
| Background jobs | Vercel Cron → `/api/jobs/run` → `jobs_queue` table |
| Hosting | Vercel (team ID: `team_JrhpYXoOW7PYjzRYlzV01lPz`) |

**Never use Firebase.** A Cowork session tried to add Firebase Auth in September 2026 — it was reverted. Always use Supabase Auth.

---

## Repository Structure (high level)

```
staffing/
├── index.html                          ← public website (staffing.assorted.group)
├── supabase-setup.sql                  ← original candidates table setup
└── hrm/
    ├── HIRING_MODULE_SPEC.md           ← full 6-phase spec
    ├── SETUP.md                        ← setup + daily operations guide (read this for how-to)
    ├── src/
    │   ├── app/
    │   │   ├── login/, client/login/   ← two separate auth entry points
    │   │   ├── apply/[jobSlug]/        ← public per-role apply form
    │   │   ├── schedule/[token]/       ← public self-schedule (token = application id)
    │   │   ├── checkin/                ← kiosk check-in
    │   │   ├── offer/[token]/          ← public offer accept/decline
    │   │   ├── onboard/[token]/        ← public onboarding portal (token = application id)
    │   │   ├── timesheet/[token]/      ← public worker timesheet submission
    │   │   ├── client/[slug]/          ← client portal (auth-gated, separate from HR)
    │   │   ├── (dashboard)/            ← HR dashboard: pipeline, candidates, jobs,
    │   │   │                             interviews, slots, offers, onboarding,
    │   │   │                             clients, requisitions, bench, placements,
    │   │   │                             timesheets, reports, settings/providers
    │   │   └── api/                    ← ~25 route handlers (apply, webhooks, scheduling,
    │   │                                  offers, onboarding, staff-aug, cron runner)
    │   ├── lib/
    │   │   ├── providers/              ← voice, sms, whatsapp, email, llm, calendar,
    │   │   │                             embeddings — ALL external SDK calls go through
    │   │   │                             these, nowhere else
    │   │   ├── jobs/                   ← screeningDispatch, screeningScore, callOutcome,
    │   │   │                             noShowSweep, retention, probationReminders,
    │   │   │                             refreshEmbedding, generateTimesheets — all
    │   │   │                             invoked from /api/jobs/run
    │   │   ├── copy/{en,ur}.ts         ← bilingual candidate-facing message templates
    │   │   ├── pdf/offerLetter.tsx     ← offer PDF generator
    │   │   ├── activity.ts             ← logActivity() helper, writes to activity_log
    │   │   └── supabase/{client,server,service}.ts
    │   └── middleware.ts               ← auth guard, differentiates HR vs client vs public routes
    └── supabase/
        ├── migrations/
        │   ├── 001_hrm_schema.sql              ← core HRM tables
        │   ├── 002_import_candidates.sql       ← imports 206 legacy candidates
        │   ├── 003_phase1_hiring_foundation.sql ← entities, extended jobs/applications/
        │   │                                       interviews, activity_log, outbound_messages,
        │   │                                       jobs_queue, candidate_embeddings, job templates
        │   ├── 004_phase3_scheduling.sql       ← interview_slots + booking sync trigger
        │   ├── 005_phase4_offers_onboarding.sql ← offers, onboarding_items, employees
        │   ├── 006_phase5_staff_augmentation.sql ← clients, client_users, requisitions,
        │   │                                        placements, timesheets, requisition_candidates
        │   └── 007_phase5_bench_search.sql     ← match_candidates() pgvector RPC
        └── functions/                          ← Deno edge functions (trigger-ai-interview,
                                                    vapi-webhook) — equivalent Next.js route
                                                    handlers also exist; either can be registered
                                                    with Vapi
```

---

## Data Flow

```
Public apply form (staffing.assorted.group form, or /apply/[jobSlug])
    │  → POST /api/apply → candidates + applications (job_id set)
    ▼
Vercel Cron (/api/jobs/run, every 5 min on Pro / daily on Hobby)
    │  screeningDispatch → Vapi call (10:00-20:00 PKT, Mon-Sat)
    │  vapi webhook → transcript stored → screeningScore (Anthropic) → auto_rules applied
    │  no-answer → retry +2h, next day, then SMS/WhatsApp drip
    ▼
Candidate self-schedules (/schedule/[application_id]) → interview_slots booked
    │  reminders queued, kiosk check-in, no-show sweep (auto-reschedule/reject)
    ▼
HR sends offer → PDF generated → /offer/[token] → candidate accepts
    │  → onboarding_items seeded → /onboard/[application_id] → e-sign + uploads
    │  → all required items done → employees row created, stage → Hired/Placed
    ▼
Good-but-unplaced candidates → candidates.bench = true, embedding computed
    │  Staff-aug: client requisition → semantic match_candidates() RPC → submit shortlist
    │  Client approves in /client/[slug] portal → HR places → placements + weekly timesheets
```

---

## Database Tables (Supabase) — full list

All tables RLS-enabled via `is_hr_user()` / `hr_can_write()` / `is_hr_admin()` / `is_client_user()`.

**Phase 1 core:** `candidates`, `pipeline_stages` (12 stages now, see below), `hr_users`, `jobs`, `applications`, `interviews`, `interview_transcripts`, `notes`, `tags`, `candidate_tags`, `email_templates`, `entities`, `application_stage_history`, `activity_log`, `outbound_messages`, `jobs_queue`, `candidate_embeddings`

**Phase 3 scheduling:** `interview_slots`

**Phase 4 offers/onboarding:** `offers`, `onboarding_items`, `employees`

**Phase 5 staff augmentation:** `clients`, `client_users`, `requisitions`, `placements`, `timesheets`, `client_requirements` (lead intake), `requisition_candidates` (submitted-to-client shortlist tracking), `client_candidate_view` (privacy-safe view: no phone/email for clients)

### RLS Policy Summary
- **anon**: INSERT only on `candidates` and `client_requirements`; SELECT on open `interview_slots`
- **authenticated (HR)**: full read/write per role via `hr_users.role` (admin/recruiter/hiring_manager/viewer)
- **authenticated (client)**: SELECT-only on their own `requisitions`/`placements`/`timesheets`/`requisition_candidates` via `client_users` mapping, UPDATE on their own timesheets (approve) and requisition_candidates (approve/reject/request-interview)
- **service role**: used server-side in `/api/jobs/run`, webhooks, and public token-based routes (schedule/offer/onboard/timesheet) — never exposed to the browser

---

## Pipeline Stages (12, seeded by migrations 001 + 003)

1. New Application
2. CV Review
3. AI Phone Screen
4. Interview Scheduled
5. HR Interview
6. Technical Assessment
7. Final Interview
8. Offer Sent
9. Onboarding
10. Hired
11. Placed (client staff-aug terminal stage)
12. Rejected

---

## Vercel Projects

| Project | Domain | Root Dir | Repo |
|---|---|---|---|
| staffing website | staffing.assorted.group | `/` | ahsanilyas010/staffing |
| HRM dashboard | hrm.assorted.group | `hrm/` | ahsanilyas010/staffing |

`hrm/vercel.json`: `cleanUrls: true`, `framework: "nextjs"`, and a `crons` entry hitting `/api/jobs/run`.

**Known constraint:** Vercel's **Hobby plan only allows daily cron schedules** — the cron is currently `0 9 * * *` (once daily). The spec wants 5-minute dispatch cadence; on Hobby this only runs once a day. To get closer to real-time dispatch, either upgrade to Vercel Pro and tighten the schedule, or call `POST /api/jobs/run` from an external scheduler with `Authorization: Bearer $CRON_SECRET`.

---

## Environment Variables (HRM) — full list

See `hrm/.env.local.example` for the authoritative list. Summary:

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY   ← service role HRM-ONLY
# Anthropic (call scoring)
ANTHROPIC_API_KEY
# Vapi (voice)
VAPI_API_KEY / VAPI_PHONE_NUMBER_ID / VAPI_ASSISTANT_ID / VAPI_WEBHOOK_SECRET
# Twilio (SMS/WhatsApp)
TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_SMS_FROM / TWILIO_WHATSAPP_FROM
# Resend (email)
RESEND_API_KEY / EMAIL_FROM
# Google Calendar (video interview Meet links)
GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET / GOOGLE_CALENDAR_REFRESH_TOKEN
# Embeddings (semantic bench search)
EMBEDDINGS_API_KEY / EMBEDDINGS_BASE_URL / EMBEDDINGS_MODEL
# Cron / guardrails
CRON_SECRET / VOICE_DAILY_BUDGET_USD / SCREENING_DAILY_CAP
# App
APP_BASE_URL
```

**Security rule unchanged:** `SUPABASE_SERVICE_ROLE_KEY` goes on `hrm.assorted.group` ONLY. Never add it to the public staffing site.

None of these third-party provider keys have been provisioned yet — until they are, the voice/messaging/offer/embedding features will error at runtime when triggered, but the build itself is green and the core pipeline (apply → candidates table → HR dashboard) works with Supabase credentials alone.

---

## Auth Pattern (must be preserved)

Two separate auth flows, same Supabase Auth backend:
- **HR**: `/login` → checked against `hr_users` → dashboard routes under `(dashboard)`
- **Client**: `/client/login` → checked against `client_users` → `/client/[slug]` portal

`hrm/src/middleware.ts` differentiates public routes (apply, schedule, checkin, offer, onboard, timesheet, webhooks — all token- or service-role-gated at the route level, not session-gated) from HR-auth routes and client-auth routes.

`@supabase/ssr` requires explicit `CookieOptions` typing on every server/service client — without it TypeScript throws `Parameter 'cookiesToSet' implicitly has an 'any' type`. This pattern is repeated in every route handler that needs a session-aware Supabase client.

---

## Pending Manual Steps (requires browser/dashboard access)

### 1. Run Supabase Migrations (in order)
SQL Editor → project `wqgjzeussogxoetispzq`, run 001 through 007 in `hrm/supabase/migrations/`.

### 2. Create Storage Buckets
Supabase → Storage → create **private** buckets: `offers`, `onboarding` (in addition to the existing `cvs` bucket).

### 3. Create HR Admin User
```sql
INSERT INTO public.hr_users (id, email, full_name, role)
SELECT id, email, 'Ahsan Ilyas', 'admin'
FROM auth.users WHERE email = 'ahsanilyas35@gmail.com';
```
(Invite via Supabase → Authentication → Users first.)

### 4. Add Domain to Vercel
Vercel Dashboard → HRM project → Settings → Domains → add `hrm.assorted.group` → add DNS record shown.

### 5. Provision third-party providers (all optional until you want that feature live)
- **Vapi.ai**: create assistant, import Twilio number, set webhook URL
- **Twilio**: confirm +92 outbound voice/SMS, enable WhatsApp sender (needs Meta Business verification)
- **Resend**: verify `assorted.group` domain
- **Anthropic**: API key with a monthly cap
- **Google Cloud**: OAuth credentials for Calendar API (Meet links)
- **Embeddings**: an OpenAI (or compatible) API key for semantic bench search

### 6. (Optional) Relink HRM to hrmsystems repo
Vercel Dashboard → HRM project → Settings → Git → disconnect `staffing` → connect `ahsanilyas010/hrmsystems` (main branch, root `/`).

---

## Key History / Decisions

- Firebase Auth was added by a rogue Cowork session (Sept 2026) and immediately reverted. Always use Supabase Auth.
- `squash merge` is used for all PRs into main.
- The `@supabase/ssr` package requires explicit `CookieOptions` typing — main early TypeScript build blocker, now fixed everywhere.
- Vercel Hobby plan cron is daily-only — the 5-minute dispatch cadence in the spec needs Pro or an external scheduler.
- All 6 phases of `HIRING_MODULE_SPEC.md` have been built. Nothing was deferred except third-party credential provisioning (manual steps above) and some polish items (per-entity NDA onboarding item variants, developer take-home task UI, external e-sign, payroll/attendance/leave — explicitly out of scope per the spec's §10).

---

## Owner

Ahsan Ilyas — `ahsanilyas35@gmail.com`
Assorted Staffing / Assorted BPO Pvt Ltd
