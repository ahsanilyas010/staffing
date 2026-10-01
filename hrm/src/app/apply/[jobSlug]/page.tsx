import { createServiceClient } from '@/lib/supabase/service'
import ApplyForm from '@/components/ApplyForm'
import { notFound } from 'next/navigation'

export const revalidate = 0

export default async function ApplyPage({ params }: { params: { jobSlug: string } }) {
  const supabase = createServiceClient()
  const { data: job } = await supabase
    .from('jobs')
    .select('id, title, slug, department, location, type, work_mode, shift, description, status, entities(name)')
    .eq('slug', params.jobSlug)
    .single()

  if (!job || job.status !== 'open') {
    notFound()
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <p className="text-orange-600 text-sm font-semibold uppercase tracking-wide">
            {(job as any).entities?.name ?? 'Assorted Group'}
          </p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{job.title}</h1>
          <p className="text-slate-500 text-sm mt-2">
            {job.location} · {job.work_mode} · {job.shift} shift · {job.type}
          </p>
          {job.description && (
            <p className="text-slate-600 mt-4 text-sm leading-relaxed">{job.description}</p>
          )}
          <div className="mt-8 border-t border-slate-100 pt-8">
            <ApplyForm jobSlug={job.slug} jobTitle={job.title} />
          </div>
        </div>
      </div>
    </div>
  )
}
