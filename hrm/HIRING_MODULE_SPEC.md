# HIRING_MODULE_SPEC.md
## Automated Hiring, Voice Screening, Onboarding and Staff Augmentation
### Repo: ahsanilyas010/staffing, app in `hrm/` (Next.js 14 App Router + Supabase + Vercel)

Read `CONTEXT.md` and `hrm/SETUP.md` first. This spec EXTENDS the existing schema (migrations 001 to 007). Do not rename or replace existing tables, RLS helpers, or the 9 seeded pipeline stages.

---

## 0. Rules for the build

- Auth is Supabase only. If any Firebase import remains anywhere in `hrm/`, delete it.
- The two Supabase Edge Functions described in SETUP.md (`trigger-ai-interview`, `vapi-webhook`) are not committed. Phase 1 recovers or rewrites them and commits them under `supabase/functions/`. Nothing exists until it is in git.
- Every new table gets RLS using the existing helpers `is_hr_user()`, `hr_can_write()`, `is_hr_admin()`. Add `is_client_user()` for the client portal.
- Service-role key only in edge functions and `app/api/*` route handlers. Never in client code.
- One migration file per phase: `supabase/migrations/0XX_phaseN_*.sql`. Idempotent.
- External calls (Vapi, Twilio, Anthropic, Resend, Google Calendar) go through adapters in `hrm/src/lib/providers/`. No provider SDK imported outside its adapter.
- Every automated action writes to `activity_log` with `actor = 'system'` and a reason.
- Nothing is sent to a candidate without a row in `outbound_messages` first. A cron job sends. Page renders never send.
- Timezone: Asia/Karachi for all scheduling.
- Candidate-facing copy bilingual (English, Urdu) in `hrm/src/lib/copy/{en,ur}.ts`.

---

## 1. Business context

Assorted Group hires for its own entities and places people at client companies. One candidate pool feeds both.

| Entity | Typical roles | Pattern |
|---|---|---|
| ABPO (call center) | CSR, telesales agent, team lead, QA, dialer admin | Weekly batches, 10 to 40 |
| APT (distribution) | Order booker, delivery rider, warehouse helper, van salesman, collections | Ongoing replacement |
| ABLLC (agency) | Designer, video editor, media buyer, developer, content writer | Ad hoc, portfolio-based |
| ACW (coworking) | Receptionist, community manager, office boy, IT support | Rare |
| HandPicked.pk | Packer, customer support, social media | Seasonal |
| Assorted Staffing (staff aug) | Anything a client requisitions | Requisition-driven, payroll with Assorted or client |

Design consequence: one pipeline, many targets. A `jobs` row belongs to either an internal entity or a client. Voice bot, scoring, scheduling are shared. Only the role profile and destination differ.

---

## 2. Functional scope

### 2.1 Role catalog (extend `jobs`)
Add columns: `entity_id` (nullable, FK `entities`), `client_id` (nullable, FK `clients`), `slug` unique, `employment_type` already exists as `type`, `work_mode` (onsite/remote/hybrid), `shift` (day/night/rotating), `must_have_skills text[]`, `nice_to_have_skills text[]`, `screening_questions jsonb`, `knockout_rules jsonb`, `auto_rules jsonb`, `interview_scorecard jsonb`, `onboarding_checklist jsonb`, `headcount_open int`, `hiring_manager_id`.
New table `entities` (ABPO, APT, ABLLC, ACW, HandPicked, Staffing). Seed job templates for every role in section 1.
Knockout rules are data. Example: `{"field":"has_motorbike","op":"eq","value":false,"action":"reject"}`.

### 2.2 Intake (extend existing)
- Existing `index.html` candidate form stays. Add a per-role apply page in the Next app: `/apply/[jobSlug]` so `applications.job_id` is set at intake instead of relying on `preferred_role` text.
- Bulk CSV import (`/candidates/import`) for Facebook-group and referral leads.
- Referral link `?ref=EMP123` stored in `candidates.referral_code`.
- WhatsApp inbound webhook: candidate messaging the hiring number gets the apply link back.
- Keep the existing 24h duplicate block in `candidates_before_insert()`. Add a merge action in the UI for older duplicates.

### 2.3 Pipeline (use existing `pipeline_stages`)
Keep the 9 seeded stages. Add three: `Interview Scheduled` (between AI Phone Screen and HR Interview), `Onboarding` (between Offer Sent and Hired), `Placed` (terminal, for client placements). `stage_type` enum gains `interview_scheduled`, `onboarding`, `placed`.
Extend `applications`: `fit_score`, `communication_score`, `salary_expectation_pkr`, `salary_within_band bool`, `availability_date`, `notice_period_days`, `alternate_job_ids uuid[]`, `ai_recommendation`, `human_decision`, `override_reason`, `parent_application_id`, `no_show_count int default 0`, `next_call_at timestamptz`, `call_attempts int default 0`.
New table `application_stage_history` (application_id, from_stage_id, to_stage_id, actor, reason, created_at). Populate from a trigger on `applications.stage_id` change. Point `advance_candidate_stage()` at the new stages.

### 2.4 AI voice screening (extend `interviews` + `interview_transcripts`)
- Trigger: instant path first (see 2.12): call at 60 seconds after apply if inside hours and cv_score passes. Fallback cron every 5 min picks `applications` in stage `New Application` or `CV Review` with `next_call_at <= now()`, within 10:00 to 20:00 PKT Mon to Sat. Outside hours, set `next_call_at` to next window.
- One Vapi assistant, multilingual. Opening line offers Urdu or English and continues in the choice. Language stored in `interviews.language`.
- Prompt built per call from `jobs.screening_questions` plus fixed blocks: identity confirm, availability and notice period, salary expectation in PKR (ask for a range if they hesitate), 3 to 6 role-fit questions, knockout checks, multi-role probe ("would you also consider [adjacent roles]?"), close with next steps.
- Max 8 minutes. Retry: no answer, +2h, then next day, max 3 (`call_attempts`). Then SMS + WhatsApp with a self-schedule callback link.
- `interviews` gains: `language`, `attempt_no`, `recording_url`, `cost_usd`. `interview_transcripts` already holds transcript, summary, `answers_scored`, `recommendation`; add `extraction jsonb` for the structured object below.

### 2.5 Scoring and sorting
After `end-of-call-report`, a server job sends transcript + job profile to Anthropic and requires strict JSON:
```json
{"fit_score":0,"communication_score":0,"english_level":1,"urdu_level":1,
 "salary_expectation_pkr":null,"salary_within_band":false,"availability_date":null,
 "notice_period_days":null,"shift_ok":null,"knockouts_failed":[],"alternate_job_slugs":[],
 "red_flags":[],"summary":"","recommendation":"shortlist|reject|hold"}
```
Write to `applications` and `interview_transcripts.extraction`. Then apply `jobs.auto_rules` (defaults: threshold 65 for ABPO agents, 70 for skilled):
- any knockout failed -> stage Rejected, `rejection_reason` = knockout
- fit >= threshold and salary within band -> stage Interview Scheduled pending (send self-schedule link)
- fit >= threshold, salary over band by <= 20% -> hold, flag hiring manager
- else hold for human review
If `alternate_job_slugs` non-empty and primary rejects, clone the application to the best alternate job with `parent_application_id` set and re-score without a new call.
Human override allowed on any decision; `override_reason` mandatory.

### 2.6 Interview scheduling
- New `interview_slots` (entity_id, location, starts_at, ends_at, capacity, booked, interviewer_id, blocked). Default location: Assorted CoWorking, above D. Watson, D-12 Markaz, Islamabad. 15-min slots, 13:00 to 17:00, Mon to Sat, capacity 2.
- Self-schedule page `/schedule/[token]`. Booking creates an `interviews` row (type `in_person` or `video`) and moves stage to Interview Scheduled. Confirmation via WhatsApp + SMS with Maps link and what to bring (CNIC copy, CV, photos).
- Reminders T-24h and T-2h. Kiosk check-in at `/checkin` by phone number, sets `interviews.checked_in_at`.
- No-show 30 min after slot -> `status = no_show`, `no_show_count += 1`, one auto reschedule offer. Second no-show -> Rejected.
- Interviewer scorecard from `jobs.interview_scorecard`, stored in `interviews.scorecard jsonb` plus `decision`.
- Video option: Google Meet link via Calendar API into `interviews.meet_link`.

### 2.7 Offers
New `offers` (application_id, salary_pkr, start_date, probation_days, pdf_url, token, sent_at, expires_at, responded_at, response). Template per entity. PDF via `@react-pdf/renderer`. Sent via WhatsApp + email using the existing `email_templates` type `offer`. Accept/decline at `/offer/[token]`. Expiry 72h, reminder at 48h.

### 2.8 Onboarding
New `onboarding_items` (application_id, item_key, label, required, status, file_url, completed_at) seeded from `jobs.onboarding_checklist`. Items: CNIC copy, photo, bank details, emergency contact, signed contract, NDA (ABPO, ABLLC), asset issue, system accounts, induction video, policy acknowledgement.
Candidate portal `/onboard/[token]`. Files in a new private bucket `onboarding`. Contract e-sign by canvas signature. On completion: stage Hired (internal) or Placed (client), create `employees` row (candidate_id, entity_id, job_id, joining_date, probation_end, status). Probation reminder 7 days before end.

### 2.9 Staff augmentation
- `clients` (slug, name, contacts jsonb, payroll_model `assorted_payroll|client_payroll`, markup_pct, fixed_fee_pkr, billing_terms).
- Promote a `client_requirements` lead to a client: "Convert to client" action creates `clients` row and a `requisitions` row.
- `requisitions` (client_id, job_id, headcount, location, start_date, budget_pkr, status open/filled/cancelled/on_hold).
- Bench: `candidates.bench bool`. Auto-set true when recommendation is shortlist and no open job matches. `/bench` page searchable by skills, city, salary, availability.
- Match engine: for a requisition, rank bench + active candidates against the requisition's job profile. One-click submit shortlist to client.
- Client portal `/client/[slug]`: Supabase auth users with `client_users` table (auth_user_id, client_id). See submitted candidates (name, summary, scores, no phone), approve/reject, request interview, view placements and timesheets.
- `placements` (candidate_id, requisition_id, start_date, end_date, bill_rate_pkr, pay_rate_pkr, status, guarantee_until default +30 days).
- `timesheets` (placement_id, week_start, hours, submitted_at, approved_at, approved_by, status). Worker submits at `/timesheet/[token]`, client approves in portal. CSV export for invoicing.

### 2.10 Reporting (extend `/reports`)
Funnel per job and entity with conversion % and median days per stage. Source performance. Voice metrics: answer rate, completion rate, avg duration, cost per screening, auto-reject rate, override rate. No-show rate per slot. Staff aug: requisition ageing, time-to-fill, bench size, placement retention.

### 2.11 Compliance
Consent already captured at apply. Add `candidates.do_not_contact`. Retention cron: archive rejected after 12 months, delete recordings after 6 months. Every automated message includes an opt-out line; STOP sets `do_not_contact`.

### 2.12 Borrowed from open-source references (ideas only, no code copied)
- **CV pre-score (ref: kristinaxm/mini-ats, Apache).** On CV upload, parse the CV to structured fields (`candidates.parsed_cv jsonb`: skills, years, last_employer, education, city) and score it 0 to 100 against the job (`applications.cv_score`). If `cv_score < jobs.auto_rules.cv_floor` (default 30), skip the voice call and hold for human review. Roles without CVs (rider, packer, helper) skip this step.
- **Instant response + fast call + short drip (ref: ampa-recruiting-template, unlicensed, read only).** On apply: SMS/WhatsApp within 10 seconds ("Thanks, we will call you shortly"), voice call at 60 seconds if inside calling hours, and a 5-step drip over 4 days if unanswered (call, SMS with callback link, call, WhatsApp, final SMS). STOP sets `do_not_contact`. Drip templates live in `outbound_messages` template keys `drip_1..5`.
- **Semantic bench search (ref: KUSHALMN/ai-voice-recruiter, MIT).** Enable pgvector. Store an embedding per candidate built from parsed CV + latest transcript summary in `candidate_embeddings (candidate_id, embedding vector(1536), updated_at)`. `/bench` search and the requisition match engine use cosine similarity combined with hard filters (city, salary band, availability). Embeddings via Anthropic-compatible or OpenAI embedding endpoint behind `providers/embeddings.ts`.
- **Developer roles only:** take-home task link stored on the job (`jobs.assessment_url`), sent after shortlist. No in-browser coding editor in v1.

---

## 3. New tables summary

`entities`, `application_stage_history`, `interview_slots`, `offers`, `onboarding_items`, `employees`, `clients`, `client_users`, `requisitions`, `placements`, `timesheets`, `outbound_messages` (candidate_id, channel whatsapp/sms/email, template_key, payload, status queued/sent/failed, provider_id, error, scheduled_for, sent_at), `activity_log`, `jobs_queue`, `candidate_embeddings` (job_type, payload, run_at, attempts, status).

Indexes: `applications(job_id, stage_id)`, `applications(next_call_at) where stage in screening`, `interviews(vapi_call_id)` exists, `outbound_messages(status, scheduled_for)`, `interview_slots(starts_at)`.

---

## 4. Providers

| Concern | Provider | Note |
|---|---|---|
| PSTN, SMS | Twilio (owned) | Confirm +92 outbound is enabled |
| Voice agent | Vapi (already in SETUP.md) | Import the Twilio number. Deepgram nova-2 STT, ElevenLabs multilingual v2 TTS, GPT-4o-mini or Claude Haiku in-call. Retell is the fallback if Urdu is poor. |
| Post-call scoring | Anthropic API, claude-sonnet-4-6 | Strict JSON |
| WhatsApp | Twilio WhatsApp sender | Needs Meta Business verification; SMS fallback until then |
| Email | Resend | Domain assorted.group |
| Files | Supabase Storage | `cvs` exists; add `onboarding`, `offers` |
| Video | Google Calendar API | Meet links |
| Jobs | Vercel Cron -> `/api/jobs/run` -> `jobs_queue` | Retries, reminders, retention, dispatch |
| PDF | `@react-pdf/renderer` | Offers, contracts |

Adapters: `hrm/src/lib/providers/{voice,whatsapp,sms,email,llm,calendar}.ts`.

---

## 5. Voice flow

1. Cron `screening.dispatch` picks due applications, builds prompt from job + candidate, calls Vapi `POST /call` with `assistantOverrides.model.messages`, inserts `interviews` row (type `ai_voice`, `vapi_call_id`).
2. Vapi webhook `/api/webhooks/vapi` (or the edge function, pick one and commit it): verify secret, on `end-of-call-report` store transcript, recording, duration, cost, enqueue `screening.score`.
3. `screening.score`: Anthropic extraction, update `applications`, apply `auto_rules`, move stage, enqueue messages.
4. Guardrails: `SCREENING_DAILY_CAP` per entity, `VOICE_DAILY_BUDGET_USD` hard stop.

In-call persona: "Assorted Group hiring assistant". Never claims to be human. Collects every listed field, repeats numbers back. Never promises a job. Out-of-scope questions get "a human will follow up".

---

## 6. Routes

```
POST /api/apply
POST /api/webhooks/vapi
POST /api/webhooks/twilio/sms
POST /api/webhooks/twilio/whatsapp
POST /api/webhooks/resend
GET/POST /api/schedule/[token]
POST /api/checkin
GET  /api/offer/[token]        POST /api/offer/[token]/respond
POST /api/onboard/[token]/upload
POST /api/timesheet/[token]
POST /api/jobs/run             (Vercel Cron, CRON_SECRET)
```
Dashboard pages to add under `(dashboard)`: `/slots`, `/offers`, `/onboarding`, `/clients`, `/requisitions`, `/bench`, `/placements`, `/timesheets`, `/settings/providers`. Extend `/jobs`, `/pipeline`, `/candidates/[id]`, `/interviews`, `/reports`, `/requirements`.

---

## 7. Phases

**Phase 1: Recover and harden.** Commit the two edge functions (or replace with route handlers). Add `entities`, extend `jobs`, seed templates, add the 3 stages, `application_stage_history`, `activity_log`, `jobs_queue`, `candidate_embeddings`, `outbound_messages`, per-role apply page, CSV import.
Accept: apply via `/apply/[slug]` lands in pipeline with `job_id` set; manual stage moves are logged.

**Phase 2: Voice screening end to end.** Dispatch cron, Vapi call, webhook, Anthropic scoring, auto_rules, retries, calling hours, budget cap.
Accept: 10 real calls (5 Urdu, 5 English), correct salary + availability extraction in at least 8, stage moves without human touch.

**Phase 3: Scheduling.** Slots, self-schedule, WhatsApp/SMS reminders, kiosk check-in, no-show automation, scorecards, Meet links.
Accept: shortlisted candidate books, gets reminders, checks in, scorecard saved.

**Phase 4: Offers and onboarding.** Offer PDF, tokenized response, onboarding portal, e-sign, `employees` creation.
Accept: a hire completes onboarding with zero HR data entry.

**Phase 5: Staff augmentation.** Clients, convert-lead, requisitions, bench, match engine, client portal, placements, timesheets, CSV export.
Accept: a requisition filled from bench, client approves in portal, one timesheet approved.

**Phase 6: Reports and retention.**

Do not start N+1 until N acceptance passes. Open a PR per phase.

---

## 8. Env vars

```
NEXT_PUBLIC_SUPABASE_URL  NEXT_PUBLIC_SUPABASE_ANON_KEY  SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
VAPI_API_KEY  VAPI_PHONE_NUMBER_ID  VAPI_ASSISTANT_ID  VAPI_WEBHOOK_SECRET
TWILIO_ACCOUNT_SID  TWILIO_AUTH_TOKEN  TWILIO_SMS_FROM  TWILIO_WHATSAPP_FROM
RESEND_API_KEY  EMAIL_FROM=hello@assorted.group
GOOGLE_CALENDAR_CLIENT_ID  GOOGLE_CALENDAR_CLIENT_SECRET  GOOGLE_CALENDAR_REFRESH_TOKEN
CRON_SECRET  VOICE_DAILY_BUDGET_USD=25  SCREENING_DAILY_CAP=60
APP_BASE_URL=https://staffing.assorted.group
```

---

## 9. Manual steps for Ahsan

1. Vapi: import Twilio number, set webhook URL, paste keys.
2. Twilio: confirm +92 outbound voice; enable WhatsApp sender; start Meta Business verification.
3. Resend: verify assorted.group.
4. Anthropic API key with monthly cap.
5. Provide offer letter and contract DOCX per entity.
6. Record a 60-second induction video per entity.
7. Add a LICENSE and root README to the repo (Cowork flagged both missing).

---

## 10. Out of scope v1
Payroll, attendance, leave, performance reviews (hrm.assorted.group side). External e-sign. Job boards (Rozee, Indeed). Video face analysis.
