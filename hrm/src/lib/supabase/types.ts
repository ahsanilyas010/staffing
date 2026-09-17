export type PipelineStageType =
  | 'applied' | 'cv_review' | 'ai_interview' | 'hr_interview'
  | 'technical' | 'final_interview' | 'offer' | 'hired' | 'rejected'

export type HrUserRole = 'admin' | 'recruiter' | 'hiring_manager' | 'viewer'
export type JobType = 'permanent' | 'contract' | 'executive' | 'temp'
export type JobStatus = 'open' | 'paused' | 'filled' | 'cancelled'
export type InterviewType = 'ai_voice' | 'phone' | 'video' | 'in_person'
export type InterviewStatus = 'scheduled' | 'in_progress' | 'completed' | 'no_show' | 'cancelled'
export type NoteType = 'general' | 'interview_feedback' | 'offer_note'
export type Recommendation = 'proceed' | 'reject' | 'hold'
export type ApplicationStatus = 'active' | 'rejected' | 'hired' | 'withdrawn'
export type TagCategory = 'skill' | 'seniority' | 'flag' | 'source'

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
  // joined
  stage?: PipelineStage
  assignee?: HrUser
}

export interface Job {
  id: string
  title: string
  department: string | null
  location: string | null
  type: JobType
  salary_min: number | null
  salary_max: number | null
  currency: string
  description: string | null
  requirements: string[]
  status: JobStatus
  created_by: string | null
  created_at: string
  updated_at: string
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
  candidate?: Candidate
  job?: Job
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
