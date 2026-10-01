'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mic2, Star, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn, formatRelative, scoreColor, initials } from '@/lib/utils'
import type { Candidate, PipelineStage } from '@/lib/supabase/types'

interface Props {
  stages: PipelineStage[]
  candidates: Candidate[]
}

export default function PipelineBoard({ stages, candidates }: Props) {
  const router = useRouter()
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver]         = useState<string | null>(null)

  const byStage = (stageId: string) =>
    candidates.filter(c => c.stage_id === stageId)

  // Exclude hired/rejected from main view to keep board clean
  const visibleStages = stages.filter(s => !['hired', 'rejected'].includes(s.stage_type))

  async function handleDrop(stageId: string) {
    if (!dragging || dragging === stageId) return
    setOver(null)
    const supabase = createClient()
    // RLS blocks updates silently (0 rows), so ask for the row back to detect it
    const { data, error } = await supabase
      .from('candidates')
      .update({ stage_id: stageId, last_activity_at: new Date().toISOString() })
      .eq('id', dragging)
      .select('id')
    if (error || !data?.length) {
      alert('Could not move this candidate. Your role may be read-only (viewer) — ask an admin for edit access.')
    }
    router.refresh()
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {visibleStages.map(stage => {
        const cards = byStage(stage.id)
        return (
          <div
            key={stage.id}
            className={cn(
              'w-64 shrink-0 rounded-xl bg-slate-100 flex flex-col transition-colors',
              over === stage.id && 'bg-brand-50 ring-2 ring-brand-300'
            )}
            onDragOver={e => { e.preventDefault(); setOver(stage.id) }}
            onDragLeave={() => setOver(null)}
            onDrop={() => handleDrop(stage.id)}
          >
            {/* Column header */}
            <div className="flex items-center justify-between px-3 pt-3 pb-2">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: stage.color }}
                />
                <span className="text-sm font-semibold text-slate-700">{stage.name}</span>
              </div>
              <span className="text-xs text-slate-400 font-medium bg-white px-1.5 py-0.5 rounded-full">
                {cards.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2 px-2 pb-3 min-h-[200px]">
              {cards.map(c => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  onDragStart={() => setDragging(c.id)}
                  onDragEnd={() => setDragging(null)}
                />
              ))}
              {cards.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-slate-400 text-xs py-8">
                  Drop here
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CandidateCard({
  candidate: c,
  onDragStart,
  onDragEnd,
}: {
  candidate: Candidate
  onDragStart: () => void
  onDragEnd: () => void
}) {
  return (
    <Link href={`/candidates/${c.id}`}>
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className="card p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow group"
      >
        <div className="flex items-start gap-2">
          <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 text-xs font-bold
                          flex items-center justify-center shrink-0">
            {initials(c.first_name, c.last_name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 truncate group-hover:text-brand-600">
              {c.first_name} {c.last_name}
            </p>
            <p className="text-xs text-slate-500 truncate">{c.preferred_role ?? '—'}</p>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <Clock className="h-3 w-3" />
            {formatRelative(c.last_activity_at)}
          </div>
          <div className="flex items-center gap-1.5">
            {c.overall_score !== null && (
              <span className={cn('flex items-center gap-0.5 text-xs font-semibold', scoreColor(c.overall_score))}>
                <Star className="h-3 w-3" />
                {c.overall_score.toFixed(1)}
              </span>
            )}
            {c.stage?.stage_type === 'ai_interview' && (
              <Mic2 className="h-3.5 w-3.5 text-purple-500" />
            )}
          </div>
        </div>

        {c.country && (
          <p className="mt-1.5 text-xs text-slate-400">{c.country}</p>
        )}
      </div>
    </Link>
  )
}
