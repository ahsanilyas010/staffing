import type {
  ClientRequirementStatus, HiringType, HiringUrgency, HrUserRole,
} from '@/lib/supabase/types'

// Order = the sales flow; values must match the CHECK constraint in migration 005
export const REQUIREMENT_STATUSES: { value: ClientRequirementStatus; label: string; className: string }[] = [
  { value: 'new',           label: 'New',           className: 'bg-blue-50 text-blue-700' },
  { value: 'contacted',     label: 'Contacted',     className: 'bg-violet-50 text-violet-700' },
  { value: 'qualified',     label: 'Qualified',     className: 'bg-amber-50 text-amber-700' },
  { value: 'proposal_sent', label: 'Proposal sent', className: 'bg-cyan-50 text-cyan-700' },
  { value: 'won',           label: 'Won',           className: 'bg-emerald-50 text-emerald-700' },
  { value: 'lost',          label: 'Lost',          className: 'bg-slate-100 text-slate-500' },
]

export const HIRING_TYPES: HiringType[] = ['Permanent', 'Contract', 'Executive', 'Offshore Team', 'RPO']
export const URGENCIES: HiringUrgency[] = ['ASAP', 'Within 1 month', 'Just exploring']

export const URGENCY_CLASS: Record<HiringUrgency, string> = {
  'ASAP':           'bg-red-50 text-red-700',
  'Within 1 month': 'bg-amber-50 text-amber-700',
  'Just exploring': 'bg-slate-100 text-slate-600',
}

// Which website button the lead came from (source_cta)
const SOURCE_CTA_LABELS: Record<string, string> = {
  nav_hire_talent:      'Header — Hire Talent',
  hero_hire_talent_now: 'Hero — Hire Talent Now',
  cta_discuss_hire:     'Closing section — Discuss a Hire',
  footer_consultation:  'Footer — Get a Consultation',
  footer_rpo:           'Footer — RPO Solutions',
}

export function statusMeta(status: string) {
  return REQUIREMENT_STATUSES.find(s => s.value === status) ?? REQUIREMENT_STATUSES[0]
}

export function sourceCtaLabel(cta: string | null) {
  if (!cta) return 'Website form'
  return SOURCE_CTA_LABELS[cta] ?? cta
}

// wa.me needs digits only, with country code; numbers typed with a leading 0
// have no country code, so WhatsApp may not resolve them — shown as-is.
export function whatsappUrl(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 7 ? `https://wa.me/${digits}` : null
}

export function canWrite(role: HrUserRole | null | undefined) {
  return role === 'admin' || role === 'recruiter' || role === 'hiring_manager'
}
