'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Requisition {
  id: string
  headcount: number
  status: string
  jobs?: { title: string }
}

interface SubmittedCandidate {
  id: string
  status: string
  similarity: number | null
  requisition_id: string
  candidate: {
    id: string
    first_name: string
    last_name: string
    preferred_role: string | null
    experience_years: string | null
    skills: string[] | null
  } | null
}

interface Placement {
  id: string
  start_date: string
  end_date: string | null
  status: string
  candidates?: { first_name: string; last_name: string }
}

interface PendingTimesheet {
  id: string
  week_start: string
  hours: number
  status: string
  placements?: { candidates?: { first_name: string; last_name: string } }
}

export default function ClientPortal({
  client,
  requisitions,
  submittedCandidates,
  placements,
  pendingTimesheets,
}: {
  client: { name: string; slug: string }
  requisitions: Requisition[]
  submittedCandidates: SubmittedCandidate[]
  placements: Placement[]
  pendingTimesheets: PendingTimesheet[]
}) {
  const router = useRouter()

  async function approveTimesheet(id: string) {
    await fetch(`/api/timesheets/${id}/approve`, { method: 'POST' })
    router.refresh()
  }

  async function respond(id: string, status: 'client_approved' | 'client_rejected' | 'interview_requested') {
    await fetch(`/api/requisition-candidates/${id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    router.refresh()
  }

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/client/login')
    router.refresh()
  }

  const statusLabel: Record<string, string> = {
    submitted: 'New',
    client_approved: 'Approved',
    client_rejected: 'Rejected',
    interview_requested: 'Interview requested',
    placed: 'Placed',
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide">Client Portal</p>
          <h1 className="text-lg font-bold text-slate-900">{client.name}</h1>
        </div>
        <button onClick={signOut} className="text-sm text-slate-500 hover:text-slate-900">Sign out</button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        <section>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Open requisitions</h2>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {requisitions.map((r) => (
              <div key={r.id} className="px-4 py-3 flex justify-between text-sm">
                <span className="font-medium text-slate-900">{r.jobs?.title ?? 'Role'}</span>
                <span className="text-slate-500">{r.headcount} needed · {r.status}</span>
              </div>
            ))}
            {requisitions.length === 0 && <p className="px-4 py-6 text-slate-400 text-sm">No open requisitions</p>}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Submitted candidates</h2>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {submittedCandidates.map((sc) => (
              <div key={sc.id} className="px-4 py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900 text-sm">
                    {sc.candidate?.first_name} {sc.candidate?.last_name}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {sc.candidate?.preferred_role} · {sc.candidate?.experience_years} yrs experience
                  </p>
                  {sc.candidate?.skills && sc.candidate.skills.length > 0 && (
                    <p className="text-xs text-slate-400 mt-1">{sc.candidate.skills.join(', ')}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {sc.status === 'submitted' ? (
                    <>
                      <button onClick={() => respond(sc.id, 'client_approved')} className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg font-medium">Approve</button>
                      <button onClick={() => respond(sc.id, 'interview_requested')} className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg font-medium">Request interview</button>
                      <button onClick={() => respond(sc.id, 'client_rejected')} className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg font-medium">Pass</button>
                    </>
                  ) : (
                    <span className="text-xs text-slate-500">{statusLabel[sc.status] ?? sc.status}</span>
                  )}
                </div>
              </div>
            ))}
            {submittedCandidates.length === 0 && <p className="px-4 py-6 text-slate-400 text-sm">No candidates submitted yet</p>}
          </div>
        </section>

        {pendingTimesheets.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Timesheets awaiting approval</h2>
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {pendingTimesheets.map((ts) => (
                <div key={ts.id} className="px-4 py-3 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium text-slate-900">
                      {ts.placements?.candidates?.first_name} {ts.placements?.candidates?.last_name}
                    </span>
                    <span className="text-slate-500 ml-2">
                      Week of {ts.week_start} — {ts.hours} hours
                    </span>
                  </div>
                  <button onClick={() => approveTimesheet(ts.id)} className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg font-medium">
                    Approve
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Active placements</h2>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {placements.map((p) => (
              <div key={p.id} className="px-4 py-3 flex justify-between text-sm">
                <span className="font-medium text-slate-900">{p.candidates?.first_name} {p.candidates?.last_name}</span>
                <span className="text-slate-500">Since {p.start_date} · {p.status}</span>
              </div>
            ))}
            {placements.length === 0 && <p className="px-4 py-6 text-slate-400 text-sm">No active placements</p>}
          </div>
        </section>
      </main>
    </div>
  )
}
