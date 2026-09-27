'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface ReadyItem {
  id: string
  candidates?: { first_name: string; last_name: string }
  requisitions?: { clients?: { name: string }; jobs?: { title: string } }
}

interface Placement {
  id: string
  start_date: string
  status: string
  bill_rate_pkr: number | null
  candidates?: { first_name: string; last_name: string }
  requisitions?: { clients?: { name: string }; jobs?: { title: string } }
}

export default function PlacementsList({ readyToPlace, placements }: { readyToPlace: ReadyItem[]; placements: Placement[] }) {
  const router = useRouter()
  const [placing, setPlacing] = useState<string | null>(null)
  const [form, setForm] = useState({ start_date: '', bill_rate_pkr: '', pay_rate_pkr: '' })

  async function confirmPlace(id: string) {
    await fetch(`/api/requisition-candidates/${id}/place`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_date: form.start_date,
        bill_rate_pkr: Number(form.bill_rate_pkr),
        pay_rate_pkr: Number(form.pay_rate_pkr),
      }),
    })
    setPlacing(null)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {readyToPlace.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Ready to place ({readyToPlace.length})</h2>
          <div className="space-y-2">
            {readyToPlace.map((rc) => (
              <div key={rc.id} className="bg-slate-50 rounded-lg px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {rc.candidates?.first_name} {rc.candidates?.last_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {rc.requisitions?.jobs?.title} at {rc.requisitions?.clients?.name}
                    </p>
                  </div>
                  <button
                    onClick={() => setPlacing(placing === rc.id ? null : rc.id)}
                    className="text-xs font-medium bg-orange-600 text-white px-3 py-1.5 rounded-lg"
                  >
                    {placing === rc.id ? 'Cancel' : 'Place'}
                  </button>
                </div>
                {placing === rc.id && (
                  <div className="flex gap-2 mt-3">
                    <input
                      type="date"
                      value={form.start_date}
                      onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                      className="input max-w-[160px]"
                    />
                    <input
                      placeholder="Bill rate (PKR)"
                      value={form.bill_rate_pkr}
                      onChange={(e) => setForm({ ...form, bill_rate_pkr: e.target.value })}
                      className="input max-w-[160px]"
                    />
                    <input
                      placeholder="Pay rate (PKR)"
                      value={form.pay_rate_pkr}
                      onChange={(e) => setForm({ ...form, pay_rate_pkr: e.target.value })}
                      className="input max-w-[160px]"
                    />
                    <button onClick={() => confirmPlace(rc.id)} className="btn-primary text-xs">Confirm</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Candidate</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Client / Role</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Start date</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Bill rate</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {placements.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{p.candidates?.first_name} {p.candidates?.last_name}</td>
                <td className="px-4 py-3 text-slate-600">{p.requisitions?.jobs?.title} @ {p.requisitions?.clients?.name}</td>
                <td className="px-4 py-3 text-slate-600">{p.start_date}</td>
                <td className="px-4 py-3 text-slate-600">{p.bill_rate_pkr?.toLocaleString() ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600 capitalize">{p.status}</td>
              </tr>
            ))}
            {placements.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">No placements yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
