import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CandidateProfile from '@/components/CandidateProfile'

export const revalidate = 0

export default async function CandidatePage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const [
    { data: candidate },
    { data: stages },
    { data: notes },
    { data: interviews },
  ] = await Promise.all([
    supabase
      .from('candidates')
      .select('*, stage:pipeline_stages(*), assignee:hr_users(id,full_name,email,role)')
      .eq('id', params.id)
      .single(),
    supabase
      .from('pipeline_stages')
      .select('*')
      .order('order_index'),
    supabase
      .from('notes')
      .select('*, author:hr_users(id,full_name,email)')
      .eq('candidate_id', params.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('interviews')
      .select('*, transcript:interview_transcripts(*)')
      .eq('candidate_id', params.id)
      .order('created_at', { ascending: false }),
  ])

  if (!candidate) notFound()

  // Fetch signed CV URL if candidate has a CV
  let cvUrl: string | null = null
  if (candidate.cv_file_path) {
    const { data: signed } = await supabase.storage
      .from('cvs')
      .createSignedUrl(candidate.cv_file_path, 3600)
    cvUrl = signed?.signedUrl ?? null
  }

  return (
    <CandidateProfile
      candidate={candidate}
      stages={stages ?? []}
      notes={notes ?? []}
      interviews={interviews ?? []}
      cvUrl={cvUrl}
    />
  )
}
