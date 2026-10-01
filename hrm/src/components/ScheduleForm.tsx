'use client'

import { useEffect, useState } from 'react'

interface Slot {
  id: string
  starts_at: string
  location: string
}

export default function ScheduleForm({ token }: { token: string }) {
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState<string | null>(null)
  const [booked, setBooked] = useState<Slot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/schedule/${token}`)
      .then((r) => r.json())
      .then((data) => {
        setSlots(data.slots ?? [])
        setLoading(false)
      })
      .catch(() => {
        setError('Could not load available times')
        setLoading(false)
      })
  }, [token])

  async function book(slot: Slot) {
    setBooking(slot.id)
    setError(null)
    try {
      const res = await fetch(`/api/schedule/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: slot.id }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Booking failed')
      }
      setBooked(slot)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBooking(null)
    }
  }

  if (booked) {
    const d = new Date(booked.starts_at)
    return (
      <div className="text-center py-6">
        <div className="text-4xl mb-3">✅</div>
        <h3 className="text-lg font-semibold text-slate-900">Interview confirmed</h3>
        <p className="text-slate-600 text-sm mt-2">
          {d.toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi', weekday: 'long', day: 'numeric', month: 'long' })}
          {' at '}
          {d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' })}
        </p>
        <p className="text-slate-500 text-xs mt-3">{booked.location}</p>
        <p className="text-slate-400 text-xs mt-4">Please bring a copy of your CNIC and CV.</p>
      </div>
    )
  }

  if (loading) return <p className="text-slate-400 text-sm">Loading available times…</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (slots.length === 0) return <p className="text-slate-400 text-sm">No slots available right now — please contact us directly.</p>

  const byDay = slots.reduce<Record<string, Slot[]>>((acc, s) => {
    const day = new Date(s.starts_at).toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi', weekday: 'short', day: 'numeric', month: 'short' })
    acc[day] = acc[day] ?? []
    acc[day].push(s)
    return acc
  }, {})

  return (
    <div className="space-y-5 max-h-[420px] overflow-y-auto">
      {Object.entries(byDay).map(([day, daySlots]) => (
        <div key={day}>
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{day}</p>
          <div className="grid grid-cols-3 gap-2">
            {daySlots.map((s) => (
              <button
                key={s.id}
                onClick={() => book(s)}
                disabled={booking !== null}
                className="text-xs font-medium border border-slate-200 rounded-lg py-2 hover:border-orange-400 hover:bg-orange-50 disabled:opacity-50 transition"
              >
                {new Date(s.starts_at).toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' })}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
