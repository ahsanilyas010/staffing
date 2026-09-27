'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Requisition {
  id: string
  headcount: number
  status: string
  clients?: { name: string }
  jobs?: { title: string }
}

interface Option {
  id: string
  name?: string
  title?: string
}

interface MatchResult {
  id: string
  first_name: string
  last_name: string
  preferred_role: string | null
  similarity: number
}

export default function RequisitionsList({
  requisitions,
  clients,
  jobs,
}: {
  requisitions: Requisition[]
  clients: Option[]
  jobs: Option[]
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [clientId, setClientId] = useState('')
  const [jobId, setJobId] = useState('')
  const [headcount, setHeadcount] = useState('1')
  const [submitting, setSubmitting] = useState(false)

  const [activeReq, setActiveReq] = useState<string | null>(null)
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [matching, setMatching] = useState(false)

  async function createRequisition() {
    setSubmitting(true)
    await fetch('/api/requisitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, job_id: jobId, headcount: Number(headcount) }),
    })
    setSubmitting(false)
    setShowForm(false)
    router.refresh()
  }

  async function runMatch(reqId: string) {
    setActiveReq(reqId)
    setMatching(true)
    setSelected(new Set())
    const res = await fetch(`/api/requisitions/${reqId}/match`)
    const data = await res.json()
    setMatches(data.results ?? [])
    setMatching(false)
  }

  function toggleSelect(id: string) {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  async function submitShortlist() {
    if (!activeReq) return
    const candidateIds = matches.filter((m) => selected.has(m.id)).map((m) => ({ id: m.id, similarity: m.similarity }))
    await fetch(`/api/requisitions/${activeReq}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_ids: candidateIds }),
    })
    setActiveReq(null)
    setMatches([])
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">+ New requisition</button>
      </div>

      {showForm && (
        <div className="card p-4 flex gap-3 flex-wrap">
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="input max-w-[200px]">
            <option value="">Select client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={jobId} onChange={(e) => setJobId(e.target.value)} className="input max-w-[200px]">
            <option value="">Select job</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
          <input
            type="number"
            value={headcount}
            onChange={(e) => setHeadcount(e.target.value)}
            placeholder="Headcount"
            className="input max-w-[120px]"
          />
          <button onClick={createRequisition} disabled={submitting || !clientId} className="btn-primary">
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Client</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Role</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Headcount</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {requisitions.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{r.clients?.name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{r.jobs?.title ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{r.headcount}</td>
                <td className="px-4 py-3 text-slate-600 capitalize">{r.status}</td>
                <td className="px-4 py-3">
                  <button onClick={() => runMatch(r.id)} className="text-orange-600 text-xs font-medium">
                    Find matches →
                  </button>
                </td>
              </tr>
            ))}
            {requisitions.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">No requisitions yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {activeReq && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Bench matches</h3>
            {selected.size > 0 && (
              <button onClick={submitShortlist} className="btn-primary text-xs">
                Submit {selected.size} to client
              </button>
            )}
          </div>
          {matching ? (
            <p className="text-slate-400 text-sm">Matching…</p>
          ) : matches.length === 0 ? (
            <p className="text-slate-400 text-sm">No bench matches found for this requisition.</p>
          ) : (
            <div className="space-y-2">
              {matches.map((m) => (
                <label key={m.id} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2 cursor-pointer">
                  <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleSelect(m.id)} />
                  <span className="text-sm font-medium text-slate-900">{m.first_name} {m.last_name}</span>
                  <span className="text-xs text-slate-500">{m.preferred_role}</span>
                  <span className="text-xs text-slate-400 ml-auto">{Math.round(m.similarity * 100)}% match</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
