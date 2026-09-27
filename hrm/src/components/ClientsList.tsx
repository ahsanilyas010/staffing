'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Client {
  id: string
  name: string
  slug: string
  payroll_model: string
}

interface Lead {
  id: string
  company_name: string
  contact_name: string
  contact_email: string
  role_needed: string
  headcount: number
}

export default function ClientsList({ clients, leads }: { clients: Client[]; leads: Lead[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function createClient() {
    setSubmitting(true)
    await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setSubmitting(false)
    setShowForm(false)
    setName('')
    router.refresh()
  }

  async function convertLead(id: string) {
    await fetch(`/api/client-requirements/${id}/convert`, { method: 'POST' })
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {leads.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">New leads ({leads.length})</h2>
          <div className="space-y-2">
            {leads.map((lead) => (
              <div key={lead.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{lead.company_name}</p>
                  <p className="text-xs text-slate-500">
                    {lead.role_needed} × {lead.headcount} — {lead.contact_name} ({lead.contact_email})
                  </p>
                </div>
                <button
                  onClick={() => convertLead(lead.id)}
                  className="text-xs font-medium bg-orange-600 text-white px-3 py-1.5 rounded-lg"
                >
                  Convert to client
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          + New client
        </button>
      </div>

      {showForm && (
        <div className="card p-4 flex gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name" className="input flex-1" />
          <button onClick={createClient} disabled={submitting || !name} className="btn-primary">
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Client</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Payroll</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Requisitions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clients.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                <td className="px-4 py-3 text-slate-600 capitalize">{c.payroll_model.replace('_', ' ')}</td>
                <td className="px-4 py-3">
                  <Link href={`/requisitions?client=${c.id}`} className="text-orange-600 text-xs font-medium">
                    View →
                  </Link>
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-12 text-center text-slate-400">No clients yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
