# Assorted Staffing — Project Context

> Hand this file to a new chat session to resume work without losing context.

---

## What This Is

A monorepo for Assorted Staffing containing:

1. **Public staffing website** — `index.html` at repo root, deployed to `staffing.assorted.group` on Vercel
2. **Recruitment HRM dashboard** — `hrm/` subdirectory, deployed to `hrm.assorted.group` on Vercel (Next.js 14 App Router)

GitHub repo: `ahsanilyas010/staffing`  
Mirror HRM repo: `ahsanilyas010/hrmsystems` (identical to `hrm/` — kept in sync)

---

## Tech Stack

| Layer | Tech |
|---|---|
| Database + Auth | Supabase (project ID: `wqgjzeussogxoetispzq`) |
| File storage | Supabase Storage, bucket: `cvs` |
| HRM frontend | Next.js 14, App Router, Tailwind CSS, shadcn/ui |
| Auth method | **Supabase Auth only** — `signInWithPassword`, SSR with `@supabase/ssr` |
| Hosting | Vercel (team ID: `team_JrhpYXoOW7PYjzRYlzV01lPz`) |

**Never use Firebase.** A Cowork session tried to add Firebase Auth in September 2026 — it was reverted. Always use Supabase Auth.

---

## Repository Structure

```
staffing/
├── index.html              ← public website (staffing.assorted.group)
├── logo.png
├── supabase-setup.sql      ← original candidates table setup
└── hrm/
    ├── src/
    │   ├── app/
    │   │   ├── login/page.tsx          ← Supabase signInWithPassword
    │   │   ├── layout.tsx              ← root layout, NO auth provider wrapper
    │   │   └── (dashboard)/
    │   │       ├── pipeline/page.tsx   ← Kanban board
    │   │       ├── candidates/         ← list + [id] profile
    │   │       ├── jobs/page.tsx
    │   │       ├── interviews/page.tsx ← "Coming soon" (AI voice deferred)
    │   │       └── reports/page.tsx
    │   ├── components/
    │   │   ├── PipelineBoard.tsx
    │   │   ├── CandidateProfile.tsx
    │   │   └── Sidebar.tsx
    │   ├── lib/supabase/
    │   │   ├── client.ts               ← browser client
    │   │   ├── server.ts               ← SSR server client
    │   │   └── types.ts                ← all TypeScript interfaces
    │   └── middleware.ts               ← auth guard, redirects to /login
    ├── supabase/
    │   ├── migrations/
    │   │   ├── 001_hrm_schema.sql      ← creates all 11 HRM tables
    │   │   └── 002_import_candidates.sql ← imports 206 existing candidates
    │   └── functions/                  ← (AI voice functions deleted, deferred)
    ├── vercel.json
    └── package.json
```

---

## Data Flow

```
Public form on staffing.assorted.group (or assorted.group)
    │  Supabase JS anon key → INSERT into candidates
    ▼
Supabase → candidates table
    │
    ▼
HRM dashboard (hrm.assorted.group)
  /pipeline   → Kanban board, all candidates by stage
  /candidates → searchable list + full candidate profile
  /reports    → funnel metrics, source breakdown
```

---

## Database Tables (Supabase)

All tables have RLS enabled. Migration file: `hrm/supabase/migrations/001_hrm_schema.sql`

| Table | Purpose |
|---|---|
| `candidates` | Core table — submissions from public website + HRM additions |
| `pipeline_stages` | Kanban columns (9 default stages) |
| `hr_users` | Maps to Supabase Auth users, roles: admin/recruiter/hiring_manager/viewer |
| `jobs` | Open positions/requisitions |
| `applications` | Links candidates to jobs |
| `interviews` | Interview events (AI voice deferred to future phase) |
| `interview_transcripts` | Transcript + AI analysis (future phase) |
| `notes` | HR team notes on candidates |
| `tags` + `candidate_tags` | Flexible labels |
| `email_templates` | Email templates for outreach |

### RLS Policy Summary
- **anon** role: INSERT only on `candidates` (public form submissions)
- **authenticated** role: SELECT + UPDATE on all tables
- **admin** role: full write access (via hr_users.role check)

---

## Pipeline Stages (seeded by migration)

1. New Application
2. CV Review
3. AI Phone Screen ← deferred (no Vapi integration yet)
4. HR Interview
5. Technical Assessment
6. Final Interview
7. Offer Sent
8. Hired
9. Rejected

---

## Vercel Projects

| Project | Domain | Root Dir | Repo |
|---|---|---|---|
| staffing website | staffing.assorted.group | `/` | ahsanilyas010/staffing |
| HRM dashboard | hrm.assorted.group | `hrm/` | ahsanilyas010/staffing |

**Important:** `hrm/vercel.json` has `cleanUrls: true` and `framework: "nextjs"`.

---

## Supabase Environment Variables (HRM)

Set in Vercel project for `hrm.assorted.group`:

```
NEXT_PUBLIC_SUPABASE_URL=https://wqgjzeussogxoetispzq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>   ← HRM ONLY, never on public site
```

**Security rule:** `SUPABASE_SERVICE_ROLE_KEY` goes on `hrm.assorted.group` ONLY. Never add it to the public staffing site.

---

## Auth Pattern (must be preserved)

`hrm/src/middleware.ts` guards all routes — unauthenticated users redirect to `/login`, authenticated users on `/login` redirect to `/pipeline`.

`hrm/src/lib/supabase/server.ts` — SSR client with explicit `CookieOptions` type:

```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr'
```

The `type CookieOptions` import is required — without it TypeScript throws `Parameter 'cookiesToSet' implicitly has an 'any' type`.

---

## Pending Manual Steps (requires browser access)

These cannot be automated via CLI/API — Ahsan must do them in the browser:

### 1. Run Supabase Migrations
Supabase dashboard → project `wqgjzeussogxoetispzq` → SQL Editor:
1. Run `hrm/supabase/migrations/001_hrm_schema.sql`
2. Run `hrm/supabase/migrations/002_import_candidates.sql` (imports 206 candidates)

### 2. Create HR Admin User
1. Supabase → Authentication → Users → Invite user → `ahsanilyas35@gmail.com`
2. Accept invite email, set password
3. SQL Editor:
```sql
INSERT INTO public.hr_users (id, email, full_name, role)
SELECT id, email, 'Ahsan Ilyas', 'admin'
FROM auth.users WHERE email = 'ahsanilyas35@gmail.com';
```

### 3. Add Domain to Vercel
Vercel Dashboard → HRM project → Settings → Domains → add `hrm.assorted.group` → add DNS record shown

### 4. (Optional) Relink HRM to hrmsystems repo
Vercel Dashboard → HRM project → Settings → Git → disconnect `staffing` → connect `ahsanilyas010/hrmsystems` (main branch, root `/`)

---

## Future Phases

- **AI Voice Interviews** — Vapi.ai integration (deferred). The `/interviews` page currently shows "Coming soon". Supabase edge functions `trigger-ai-interview` and `vapi-webhook` were built but deleted to keep the build clean.
- **WhatsApp outreach** — future phase
- **Email sending** — Resend integration (templates table exists, sending not wired up)

---

## Key History / Decisions

- Firebase Auth was added by a rogue Cowork session (Sept 2026) and immediately reverted. Always use Supabase Auth.
- `squash merge` is used for all PRs into main.
- The `@supabase/ssr` package requires explicit `CookieOptions` typing — this was the main TypeScript build blocker, now fixed.
- AI voice (Vapi.ai) was deliberately deferred — do not re-add without explicit instruction.

---

## Owner

Ahsan Ilyas — `ahsanilyas35@gmail.com`  
Assorted Staffing / Assorted BPO Pvt Ltd
