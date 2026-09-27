'use client'

import { useEffect, useState } from 'react'

interface TimesheetData {
  id: string
  week_start: string
  hours: number
  status: string
  placements?: {
    candidates?: { first_name: string; last_name: string }
    requisitions?: { jobs?: { title: string } }
  }
}

export default function TimesheetForm({ token }: { token: string }) {
  const [timesheet, setTimesheet] = useState<TimesheetData | null>(null)
  const [hours, setHours] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/timesheet/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setTimesheet(data.timesheet)
        setSubmitted(data.timesheet.status !== 'draft')
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [token])

  async function submit() {
    await fetch(`/api/timesheet/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hours: Number(hours) }),
    })
    setSubmitted(true)
  }

  if (loading) return <p className="text-slate-400 text-sm">Loading…</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!timesheet) return null

  if (submitted) {
    return (
      <div className="text-center py-6">
        <div className="text-4xl mb-3">✅</div>
        <h3 className="text-lg font-semibold text-slate-900">Timesheet submitted</h3>
        <p className="text-slate-500 text-sm mt-2">Thanks — your client will review it shortly.</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">Weekly Timesheet</h1>
      <p className="text-slate-500 text-sm mt-1">
        {timesheet.placements?.candidates?.first_name} — week of {timesheet.week_start}
      </p>
      <p className="text-slate-400 text-xs mt-1">{timesheet.placements?.requisitions?.jobs?.title}</p>

      <div className="mt-6">
        <label className="block text-sm text-slate-600 mb-1.5">Total hours worked this week</label>
        <input
          type="number"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm"
          placeholder="e.g. 40"
        />
      </div>

      <button
        onClick={submit}
        disabled={!hours}
        className="w-full mt-4 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50"
      >
        Submit timesheet
      </button>
    </div>
  )
}
