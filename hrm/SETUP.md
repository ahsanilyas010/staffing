# Assorted Staffing HRM — Setup Guide

## Prerequisites
- Supabase project (existing one with the `candidates` table)
- Vapi.ai account
- Twilio account (PSTN + SMS + WhatsApp)
- Resend account
- Anthropic API key
- Vercel account
- Node.js 18+

---

## Step 1 — Supabase Database

Open your Supabase project → **SQL Editor** and run, in order:

1. `supabase/migrations/001_hrm_schema.sql` — core HRM tables (candidates extension, jobs, applications, interviews, pipeline_stages, hr_users, notes, tags, email_templates)
2. `supabase/migrations/002_import_candidates.sql` — imports existing website candidates
3. `supabase/migrations/003_phase1_hiring_foundation.sql` — entities, extended jobs/applications/interviews, 3 new pipeline stages, activity_log, application_stage_history, outbound_messages, jobs_queue, candidate_embeddings (pgvector), and seeded job templates for every Assorted Group entity

Each migration is idempotent — safe to re-run.

---

## Step 2 — Supabase Edge Functions

Two Edge Functions live in `supabase/functions/`:

- `trigger-ai-interview` — dispatches a Vapi screening call for a due application, respecting calling hours (10:00–20:00 PKT, Mon–Sat)
- `vapi-webhook` — receives Vapi's `end-of-call-report`, verifies the HMAC signature, stores the transcript, and enqueues scoring

Deploy them:

```bash
npm i -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF

supabase functions deploy trigger-ai-interview
supabase functions deploy vapi-webhook

supabase secrets set VAPI_API_KEY=your_key
supabase secrets set VAPI_PHONE_NUMBER_ID=your_phone_number_id
supabase secrets set VAPI_ASSISTANT_ID=your_assistant_id
supabase secrets set VAPI_WEBHOOK_SECRET=your_webhook_secret
```

**Note:** the same logic also exists as Next.js route handlers (`/api/webhooks/vapi`, dispatch via `/api/jobs/run`) so the system works even without deploying the Edge Functions — pick whichever webhook URL you register with Vapi.

---

## Step 3 — Vapi.ai Setup

1. Create a Vapi.ai account
2. Import your Twilio phone number as a Vapi phone number
3. Create one multilingual Assistant. The opening line should offer the candidate a choice of Urdu or English and continue in their choice — the actual per-call system prompt is built dynamically per job from `jobs.screening_questions` (see `hrm/src/lib/jobs/screeningDispatch.ts` and the Edge Function).
4. Recommended stack inside Vapi: Deepgram nova-2 (STT), ElevenLabs multilingual v2 (TTS), GPT-4o-mini or Claude Haiku (in-call reasoning). Retell AI is the fallback if Urdu quality is poor.
5. Set the webhook URL to either:
   - `https://YOUR_PROJECT.supabase.co/functions/v1/vapi-webhook`, or
   - `https://hrm.assorted.group/api/webhooks/vapi`

---

## Step 4 — Twilio Setup

1. Confirm +92 (Pakistan) outbound voice and SMS are enabled on your account
2. Enable a WhatsApp sender (requires Meta Business verification — SMS is used as a fallback until that completes)
3. Note your Account SID, Auth Token, SMS number, and WhatsApp number for `.env.local`

---

## Step 5 — HR Dashboard (Next.js)

```bash
cd hrm
cp .env.local.example .env.local
# Edit .env.local with your real values
npm install
npm run dev
```

Visit http://localhost:3000

---

## Step 6 — Create First HR User

1. Supabase Dashboard → **Authentication → Users** → Invite user
2. After they set their password, run:

```sql
insert into public.hr_users (id, email, full_name, role)
select id, email, 'HR Manager', 'admin'
from auth.users where email = 'hr@assorted.group';
```

---

## Step 7 — Deploy to Vercel

1. Import the `hrm/` root directory as a Vercel project
2. Set all environment variables from `.env.local.example` in Vercel project settings
3. Set custom domain: `hrm.assorted.group`
4. Vercel Cron is already configured in `vercel.json` — it hits `/api/jobs/run` once daily (09:00 UTC) to dispatch screening calls, send queued messages, and process the background job queue. **Vercel's Hobby plan only allows daily cron schedules** — if you're on Hobby, this is as frequent as it can run. To dispatch calls and messages closer to real time (e.g. every 5 minutes, as the original spec intends), either upgrade the Vercel project to Pro and tighten the schedule in `vercel.json`, or call `POST /api/jobs/run` from an external scheduler (e.g. a GitHub Actions cron, cron-job.org, or another always-on server) with `Authorization: Bearer $CRON_SECRET`. Make sure `CRON_SECRET` is set either way — the route rejects any request without a matching header.
5. Deploy

---

## Environment Variables Reference

See `.env.local.example` for the full list. Highlights:

| Variable | Where to find |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (keep secret — server-side only) |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `VAPI_API_KEY` / `VAPI_PHONE_NUMBER_ID` / `VAPI_ASSISTANT_ID` / `VAPI_WEBHOOK_SECRET` | Vapi.ai dashboard |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_SMS_FROM` / `TWILIO_WHATSAPP_FROM` | Twilio console |
| `RESEND_API_KEY` / `EMAIL_FROM` | resend.com |
| `GOOGLE_CALENDAR_*` | Google Cloud Console OAuth credentials |
| `CRON_SECRET` | Any random string — must match what Vercel Cron sends |
| `VOICE_DAILY_BUDGET_USD` / `SCREENING_DAILY_CAP` | Guardrails on the screening dispatcher |

---

## Daily Operations

### Candidate intake
- Public website form (`index.html`) still inserts directly into `candidates`
- Per-role apply page: `hrm.assorted.group/apply/[job-slug]` (or `staffing.assorted.group/apply/...` once linked) sets `applications.job_id` at intake
- Bulk CSV import: **Candidates → Import CSV** in the dashboard
- Referral links: append `?ref=EMP123` to any apply link

### AI voice screening
- Runs automatically via Vercel Cron (daily on Hobby, or more frequently if upgraded to Pro / an external scheduler is wired up — see Step 7) — no manual trigger needed
- Calls happen 10:00–20:00 PKT, Monday to Saturday, up to `SCREENING_DAILY_CAP` per day
- Transcripts, scores, and stage moves happen automatically after each call

### Moving a candidate through the pipeline
- Pipeline board → drag card to new stage, or Candidate Profile → change stage dropdown
- Every stage change is logged to `application_stage_history` and `activity_log`

### Scheduling (Phase 3)
- Shortlisted candidates get a self-schedule link (`/schedule/[application_id]`) — booking a slot auto-confirms via WhatsApp and queues T-24h/T-2h SMS reminders
- Front-desk kiosk: open `/checkin` on a tablet — candidates check in with their phone number
- No-shows are swept automatically: first miss offers a reschedule link, second miss auto-rejects
- **Interview Slots** page shows upcoming availability (15-min slots, 13:00–17:00 PKT, Mon–Sat, seeded 14 days out by migration 004 — re-run the seed block in that migration periodically, or extend it, to keep slots available)

### Offers and onboarding (Phase 4)
- From a candidate's application, send an offer via `POST /api/applications/[id]/offer` with `{ salary_pkr, start_date, probation_days }` — generates a PDF, uploads it to the private `offers` storage bucket, and sends the candidate a WhatsApp link to `/offer/[token]` (72h expiry, 48h reminder)
- Accepting an offer seeds `onboarding_items` from the job's `onboarding_checklist` and sends the candidate to `/onboard/[application_id]` — uploads go to the private `onboarding` bucket, contract signing uses an in-browser canvas signature pad
- Completing all required items automatically creates the `employees` row and advances the pipeline to Hired (or Placed, for client jobs)
- **Storage buckets required**: create `offers` and `onboarding` as private buckets in Supabase Storage (alongside the existing `cvs` bucket)

### Staff augmentation (Phase 5)
- **Clients** page: create a client directly, or convert a `client_requirements` lead (captured via the public "request staffing" intake — wire a form to insert into that table, or add rows via SQL/dashboard) with one click — this also creates a job and an open requisition
- **Requisitions** page: create a requisition against a client + job, then "Find matches" runs the semantic bench-search match engine (pgvector cosine similarity over `candidate_embeddings`) and lets you submit a shortlist to the client in one click
- **Client Portal** (`/client/login`, separate from the HR `/login`): client contacts sign in with a Supabase Auth account mapped via `client_users`, see submitted candidates (name/role/skills only — no phone/email, enforced by the `client_candidate_view` view), approve/reject/request-interview, and approve weekly timesheets. To onboard a client contact: invite them via Supabase Auth same as an HR user, then `insert into public.client_users (auth_user_id, client_id, full_name, email) values (...)`
- **Placements** page: once a client approves a candidate, "Place" them with a start date and bill/pay rate — this also flips `candidates.bench` off and auto-fills the requisition when headcount is met
- **Bench** page: semantic search over shortlisted-but-unplaced candidates (`candidates.bench = true`), combining a free-text query (embedded and matched via the `match_candidates` RPC) with hard filters (city, max salary)
- **Timesheets**: generated automatically every Monday for active placements (cron, see Phase 2/3 cadence notes), worker fills hours at `/timesheet/[token]`, client approves in the portal, HR exports approved timesheets as CSV from the Timesheets page for invoicing
- Requires an embeddings provider — set `EMBEDDINGS_API_KEY` (OpenAI-compatible; defaults to OpenAI `text-embedding-3-small`, 1536 dimensions to match the `candidate_embeddings` schema)

### Reporting and retention (Phase 6)
- **Reports** page: pipeline funnel, AI voice screening metrics (answer rate, avg duration, cost per screening, auto-reject rate, HR override rate), source performance, interview no-show rate, and staff-aug metrics (open requisitions, average ageing, time-to-fill, employee retention)
- **Settings → Providers** page: read-only check of which provider env vars are set, without exposing values
- Retention cron (runs once daily): archives rejected applications older than 12 months (skips bench candidates), and clears call recording URLs older than 6 months
- Probation reminders: employees within 7 days of `probation_end` get flagged in `activity_log` for HR review

---

## Additional Storage Buckets

Beyond the original `cvs` bucket, create these **private** buckets in Supabase Storage:
- `offers` — generated offer letter PDFs
- `onboarding` — onboarding document uploads and signature images

## Phases

This build implements all 6 phases of the Hiring Module spec (see `hrm/HIRING_MODULE_SPEC.md`):
1. Foundation — schema, provider adapters, public apply flow
2. AI voice screening — dispatch, scoring, retries, drip messaging
3. Scheduling — self-schedule, reminders, kiosk check-in, no-show handling
4. Offers and onboarding — PDF offers, e-sign, automatic employee creation
5. Staff augmentation — clients, requisitions, bench search, client portal, placements, timesheets
6. Reporting and retention — full metrics dashboard, data retention automation

Each phase's acceptance criteria are in the spec. All phases build on the same schema foundation from Phase 1 — no tables were renamed or replaced.
