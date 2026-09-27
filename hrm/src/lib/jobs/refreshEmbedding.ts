import { SupabaseClient } from '@supabase/supabase-js'
import { embed } from '@/lib/providers/embeddings'

export async function refreshCandidateEmbedding(supabase: SupabaseClient, candidateId: string) {
  const { data: candidate } = await supabase
    .from('candidates')
    .select('first_name, last_name, preferred_role, experience_years, parsed_cv, country')
    .eq('id', candidateId)
    .single()

  if (!candidate) return

  const { data: latestTranscript } = await supabase
    .from('interview_transcripts')
    .select('ai_summary, interviews!inner(candidate_id)')
    .eq('interviews.candidate_id', candidateId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const parts = [
    `${candidate.first_name} ${candidate.last_name}`,
    candidate.preferred_role ?? '',
    `${candidate.experience_years ?? ''} years experience`,
    candidate.country ?? '',
    candidate.parsed_cv ? JSON.stringify(candidate.parsed_cv) : '',
    latestTranscript?.ai_summary ?? '',
  ].filter(Boolean)

  const text = parts.join('. ')
  if (!text.trim()) return

  const vector = await embed(text)

  await supabase.from('candidate_embeddings').upsert(
    {
      candidate_id: candidateId,
      embedding: vector,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'candidate_id' }
  )
}
