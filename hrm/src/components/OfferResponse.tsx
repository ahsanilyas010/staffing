'use client'

import { useEffect, useState } from 'react'

interface OfferData {
  candidate_name: string
  role: string
  entity: string
  salary_pkr: number
  start_date: string
  probation_days: number
  status: string
  expires_at: string
  pdf_url: string | null
}

export default function OfferResponse({ token }: { token: string }) {
  const [offer, setOffer] = useState<OfferData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [responded, setResponded] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/offer/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error('Offer not found')
        return r.json()
      })
      .then((data) => {
        setOffer(data)
        setResponded(data.status !== 'sent' ? data.status : null)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [token])

  async function respond(response: 'accepted' | 'declined') {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/offer/${token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResponded(response)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <p className="text-slate-400 text-sm">Loading offer…</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!offer) return null

  if (responded === 'accepted') {
    return (
      <div className="text-center py-6">
        <div className="text-4xl mb-3">🎉</div>
        <h3 className="text-lg font-semibold text-slate-900">Offer accepted!</h3>
        <p className="text-slate-500 text-sm mt-2">
          Congratulations and welcome to {offer.entity}. We'll send your onboarding link shortly.
        </p>
      </div>
    )
  }

  if (responded === 'declined') {
    return (
      <div className="text-center py-6">
        <h3 className="text-lg font-semibold text-slate-900">Offer declined</h3>
        <p className="text-slate-500 text-sm mt-2">Thanks for letting us know. We wish you the best.</p>
      </div>
    )
  }

  if (responded === 'expired') {
    return <p className="text-amber-600 text-sm">This offer has expired. Please contact HR for a new one.</p>
  }

  return (
    <div>
      <p className="text-orange-600 text-sm font-semibold uppercase tracking-wide">{offer.entity}</p>
      <h1 className="text-xl font-bold text-slate-900 mt-1">Offer of Employment</h1>
      <p className="text-slate-500 text-sm mt-2">Dear {offer.candidate_name},</p>

      <div className="mt-6 space-y-2 text-sm border-t border-b border-slate-100 py-4">
        <div className="flex justify-between"><span className="text-slate-500">Position</span><span className="font-medium">{offer.role}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Salary</span><span className="font-medium">PKR {offer.salary_pkr.toLocaleString()}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Start date</span><span className="font-medium">{offer.start_date}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Probation</span><span className="font-medium">{offer.probation_days} days</span></div>
      </div>

      {offer.pdf_url && (
        <a href={offer.pdf_url} target="_blank" rel="noopener noreferrer" className="text-orange-600 text-sm font-medium mt-4 inline-block">
          View full offer letter (PDF) →
        </a>
      )}

      <p className="text-xs text-slate-400 mt-4">
        This offer expires {new Date(offer.expires_at).toLocaleString('en-GB', { timeZone: 'Asia/Karachi' })}
      </p>

      <div className="flex gap-3 mt-6">
        <button
          onClick={() => respond('accepted')}
          disabled={submitting}
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50"
        >
          Accept offer
        </button>
        <button
          onClick={() => respond('declined')}
          disabled={submitting}
          className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 rounded-lg disabled:opacity-50"
        >
          Decline
        </button>
      </div>
    </div>
  )
}
