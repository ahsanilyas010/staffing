'use client'

import { useState } from 'react'

export default function CheckinPage() {
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleCheckin(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMessage(`Welcome, ${data.name}! Please have a seat, someone will call you shortly.`)
      setStatus('success')
      setTimeout(() => {
        setStatus('idle')
        setPhone('')
      }, 8000)
    } catch (err) {
      setMessage((err as Error).message)
      setStatus('error')
      setTimeout(() => setStatus('idle'), 5000)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-10 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Assorted Group</h1>
        <p className="text-slate-500 mt-1">Interview Check-In</p>

        {status === 'success' ? (
          <div className="mt-8">
            <div className="text-5xl mb-3">✅</div>
            <p className="text-lg font-medium text-slate-900">{message}</p>
          </div>
        ) : (
          <form onSubmit={handleCheckin} className="mt-8 space-y-4">
            <input
              type="tel"
              required
              autoFocus
              placeholder="Enter your phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full text-center text-lg border border-slate-300 rounded-xl px-4 py-4"
            />
            {status === 'error' && <p className="text-red-600 text-sm">{message}</p>}
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold text-lg py-4 rounded-xl disabled:opacity-50"
            >
              {status === 'loading' ? 'Checking in…' : 'Check In'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
