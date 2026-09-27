export type PipelineStageType =
  | 'applied' | 'cv_review' | 'ai_interview' | 'interview_scheduled' | 'hr_interview'
  | 'technical' | 'final_interview' | 'offer' | 'onboarding' | 'hired' | 'placed' | 'rejected'

export type HrUserRole = 'admin' | 'recruiter' | 'hiring_manager' | 'viewer'
export type JobType = 'permanent' | 'contract' | 'executive' | 'temp'
export type JobStatus = 'open' | 'paused' | 'filled' | 'cancelled'
export type WorkMode = 'onsite' | 'remote' | 'hybrid'
export type Shift = 'day' | 'night' | 'rotating'
export type InterviewType = 'ai_voice' | 'phone' | 'video' | 'in_person'
export type InterviewStatus = 'scheduled' | 'in_progress' | 'completed' | 'no_show' | 'cancelled'
export type InterviewLanguage = 'en' | 'ur'
export type InterviewDecision = 'pass' | 'fail' | 'hold'
export type NoteType = 'general' | 'interview_feedback' | 'offer_note'
export type Recommendation = 'proceed' | 'reject' | 'hold'
export type AiRecommendation = 'shortlist' | 'reject' | 'hold'
export type HumanDecision = 'shortlist' | 'reject' | 'hold' | 'hire'
export type ApplicationStatus = 'active' | 'rejected' | 'hired' | 'withdrawn'
export type TagCategory = 'skill' | 'seniority' | 'flag' | 'source'
export type OutboundChannel = 'whatsapp' | 'sms' | 'email'
export type OutboundStatus = 'queued' | 'sent' | 'failed' | 'cancelled'
export type JobQueueStatus = 'pending' | 'running' | 'done' | 'failed'

export interface Entity {
  id: string
  slug: string
  name: string
  description: string | null
  created_at: string
}

export interface PipelineStage {
  id: string
  name: string
  order_index: number
  color: string
  stage_type: PipelineStageType
  created_at: string
}

export interface HrUser {
  id: string
  email: string
  full_name: string | null
  role: HrUserRole
  avatar_url: string | null
  created_at: string
}

export interface Candidate {
  id: string
  created_at: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  country: string | null
  relocation_pref: string | null
  preferred_role: string | null
  experience_years: string | null
  salary_expectation: string | null
  cv_file_path: string | null
  cv_file_name: string | null
  consent: boolean
  status: string
  source: string | null
  linkedin_url: string | null
  skills: string[]
  notes_count: number
  last_activity_at: string
  assigned_to: string | null
  overall_score: number | null
  stage_id: string | null
  referral_code: string | null
  do_not_contact: boolean
  bench: boolean
  parsed_cv: Record<string, unknown> | null
  // joined
  stage?: PipelineStage
  assignee?: HrUser
}

export interface Job {
  id: string
  title: string
  slug: string
  entity_id: string | null
  client_id: string | null
  department: string | null
  location: string | null
  type: JobType
  work_mode: WorkMode
  shift: Shift
  salary_min: number | null
  salary_max: number | null
  currency: string
  description: string | null
  requirements: string[]
  must_have_skills: string[]
  nice_to_have_skills: string[]
  screening_questions: { q: string }[]
  knockout_rules: Record<string, unknown>[]
  auto_rules: Record<string, unknown>
  interview_scorecard: Record<string, unknown>[]
  onboarding_checklist: Record<string, unknown>[]
  headcount_open: number
  hiring_manager_id: string | null
  assessment_url: string | null
  status: JobStatus
  created_by: string | null
  created_at: string
  updated_at: string
  entity?: Entity
}

export interface Application {
  id: string
  candidate_id: string
  job_id: string | null
  applied_at: string
  stage_id: string | null
  status: ApplicationStatus
  source: string | null
  rejection_reason: string | null
  hired_at: string | null
  assigned_to: string | null
  fit_score: number | null
  communication_score: number | null
  cv_score: number | null
  salary_expectation_pkr: number | null
  salary_within_band: boolean | null
  availability_date: string | null
  notice_period_days: number | null
  alternate_job_ids: string[]
  ai_recommendation: AiRecommendation | null
  human_decision: HumanDecision | null
  override_reason: string | null
  parent_application_id: string | null
  no_show_count: number
  next_call_at: string | null
  call_attempts: number
  referral_code: string | null
  parsed_cv: Record<string, unknown> | null
  candidate?: Candidate
  job?: Job
}

export interface ApplicationStageHistory {
  id: string
  application_id: string
  from_stage_id: string | null
  to_stage_id: string | null
  actor: string
  reason: string | null
  created_at: string
}

export interface ActivityLogEntry {
  id: string
  entity_type: 'candidate' | 'application' | 'interview' | 'offer' | 'onboarding'
  entity_id: string
  actor: string
  action: string
  reason: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface OutboundMessage {
  id: string
  candidate_id: string | null
  application_id: string | null
  channel: OutboundChannel
  template_key: string
  payload: Record<string, unknown>
  status: OutboundStatus
  provider_id: string | null
  error: string | null
  scheduled_for: string
  sent_at: string | null
  created_at: string
}

export interface Interview {
  id: string
  application_id: string | null
  candidate_id: string
  type: InterviewType
  scheduled_at: string | null
  completed_at: string | null
  duration_seconds: number | null
  interviewer_id: string | null
  vapi_call_id: string | null
  status: InterviewStatus
  overall_score: number | null
  summary: string | null
  language: InterviewLanguage
  attempt_no: number
  recording_url: string | null
  cost_usd: number | null
  scorecard: Record<string, unknown> | null
  decision: InterviewDecision | null
  checked_in_at: string | null
  meet_link: string | null
  created_at: string
  candidate?: Candidate
  transcript?: InterviewTranscript
}

export interface InterviewTranscript {
  id: string
  interview_id: string
  transcript: { role: string; content: string; time?: number }[] | null
  ai_summary: string | null
  sentiment_score: number | null
  keywords_detected: string[]
  questions_asked: Record<string, unknown> | null
  answers_scored: Record<string, unknown> | null
  recommendation: Recommendation | null
  extraction: Record<string, unknown> | null
  created_at: string
}

export interface Note {
  id: string
  candidate_id: string
  application_id: string | null
  author_id: string | null
  content: string
  note_type: NoteType
  created_at: string
  author?: HrUser
}

export interface Tag {
  id: string
  name: string
  color: string
  category: TagCategory
}

export interface PipelineSummaryRow {
  stage_id: string
  stage_name: string
  stage_type: PipelineStageType
  color: string
  order_index: number
  count: number
}
