# Assorted Staffing HRM — Setup Guide

## Prerequisites
- Supabase project (existing one with the `candidates` table)
- Vapi.ai account
- Vercel account
- Node.js 18+

---

## Step 1 — Supabase Database

1. Open your Supabase project → **SQL Editor**
2. Run `supabase/migrations/001_hrm_schema.sql` (the whole file)
3. This will:
   - Add new columns to your existing `candidates` table
   - Create 9 new tables (jobs, applications, pipeline_stages, interviews, etc.)
   - Seed default pipeline stages and tags
   - Set up RLS policies

---

## Step 2 — Supabase Edge Functions

Deploy the two Edge Functions:

```bash
# Install Supabase CLI first: npm i -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Deploy both functions
supabase functions deploy trigger-ai-interview
supabase functions deploy vapi-webhook

# Set secrets (do this in Supabase Dashboard → Edge Functions → Secrets, or via CLI)
supabase secrets set VAPI_API_KEY=your_key
supabase secrets set VAPI_ASSISTANT_ID_GENERAL=your_assistant_id
supabase secrets set VAPI_WEBHOOK_SECRET=your_webhook_secret
```

---

## Step 3 — Vapi.ai Setup

1. Create a Vapi.ai account at vapi.ai
2. Create a new Phone Number
3. Create an Assistant with this system prompt template:

```
You are a professional recruitment screener for Assorted Staffing, an international recruitment agency.
You are calling {{candidate_name}} regarding the {{candidate_role}} position.

Your tone is warm, professional and concise. Complete the following questions:
1. Please tell me about your most recent role and key responsibilities.
2. What is your current notice period?
3. What are your salary expectations (annual, in USD)?
4. Are you open to relocation, or do you prefer remote work?
5. Walk me through a significant challenge you solved in your last role and your approach.
6. Why are you looking for a new opportunity at this time?

After all questions, thank the candidate and let them know the team will be in touch.
Score the candidate 1-10 based on communication clarity, relevant experience, and cultural fit.
```

4. Enable **Function Calling** in the assistant settings
5. Add webhook URL: `https://YOUR_SUPABASE_URL/functions/v1/vapi-webhook`
6. Copy your **Assistant ID** and **API Key**

---

## Step 4 — HR Dashboard (Next.js)

```bash
cd hrm
cp .env.local.example .env.local
# Edit .env.local with your real values
npm install
npm run dev
```

Visit http://localhost:3000

---

## Step 5 — Create First HR User

1. Go to your Supabase Dashboard → **Authentication → Users**
2. Click "Invite user" and enter the HR team member's email
3. After they set their password, run this SQL to give them the admin role:

```sql
insert into public.hr_users (id, email, full_name, role)
values (
  'PASTE_THE_AUTH_USER_UUID_HERE',
  'hr@assorted.group',
  'HR Manager',
  'admin'
);
```

---

## Step 6 — Deploy to Vercel

1. Push the `hrm/` folder to a new GitHub repo (or subfolder of this repo)
2. Import it in Vercel → New Project
3. Set these environment variables in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `VAPI_API_KEY`
   - `VAPI_WEBHOOK_SECRET`
4. Set custom domain: `hrm.assorted.group`
5. Deploy

---

## Environment Variables Reference

| Variable | Where to find |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key (keep secret!) |
| `VAPI_API_KEY` | Vapi.ai → Dashboard → API Keys |
| `VAPI_ASSISTANT_ID_GENERAL` | Vapi.ai → Assistants → your assistant ID |
| `VAPI_WEBHOOK_SECRET` | Set your own random string, same in Vapi and here |
| `RESEND_API_KEY` | resend.com → API Keys |

---

## Daily Operations

### Moving a candidate through the pipeline
- Open **Pipeline** board → drag card to new stage
- Or open **Candidate Profile** → change stage dropdown

### Triggering an AI Interview
1. Open Candidate Profile
2. Click **Start AI Interview**
3. Vapi will call the candidate's phone within seconds
4. When the call ends, the transcript and score auto-appear in the profile

### Adding HR notes
- Open Candidate Profile → Notes section → type and click Add

### Viewing reports
- Open **Reports** page for pipeline funnel and interview stats
