'use client'

import { useEffect, useRef, useState } from 'react'

interface Item {
  id: string
  item_key: string
  label: string
  required: boolean
  status: string
  file_url: string | null
}

export default function OnboardingChecklist({ token }: { token: string }) {
  const [items, setItems] = useState<Item[]>([])
  const [candidate, setCandidate] = useState<{ first_name: string; last_name: string } | null>(null)
  const [job, setJob] = useState<{ title: string; entities?: { name: string } } | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeSignature, setActiveSignature] = useState(false)

  async function refresh() {
    const res = await fetch(`/api/onboard/${token}`)
    const data = await res.json()
    setItems(data.items ?? [])
    setCandidate(data.candidate)
    setJob(data.job)
    setLoading(false)
  }

  useEffect(() => {
    refresh()
  }, [token])

  async function uploadFile(itemKey: string, file: File) {
    const form = new FormData()
    form.append('item_key', itemKey)
    form.append('file', file)
    await fetch(`/api/onboard/${token}/upload`, { method: 'POST', body: form })
    refresh()
  }

  const allDone = items.length > 0 && items.filter((i) => i.required).every((i) => i.status === 'submitted' || i.status === 'approved')

  if (loading) return <p className="text-slate-400 text-sm">Loading…</p>

  if (allDone) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-3">🎉</div>
        <h3 className="text-lg font-semibold text-slate-900">All done!</h3>
        <p className="text-slate-500 text-sm mt-2">
          Welcome to {job?.entities?.name ?? 'the team'}. HR will be in touch with next steps.
        </p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-orange-600 text-sm font-semibold uppercase tracking-wide">{job?.entities?.name ?? 'Assorted Group'}</p>
      <h1 className="text-xl font-bold text-slate-900 mt-1">Welcome, {candidate?.first_name}!</h1>
      <p className="text-slate-500 text-sm mt-1">Complete the steps below to finish onboarding for {job?.title}.</p>

      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="border border-slate-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-900">{item.label}</span>
              {item.status === 'submitted' || item.status === 'approved' ? (
                <span className="text-emerald-600 text-xs font-semibold">✓ Done</span>
              ) : (
                <span className="text-slate-400 text-xs">Pending</span>
              )}
            </div>

            {item.status !== 'submitted' && item.status !== 'approved' && (
              <div className="mt-3">
                {item.item_key === 'signed_contract' ? (
                  <SignaturePad
                    onSign={async (dataUrl) => {
                      await fetch(`/api/onboard/${token}/upload`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ item_key: item.item_key, signature_data_url: dataUrl }),
                      })
                      refresh()
                    }}
                  />
                ) : item.item_key === 'induction_video' || item.item_key === 'policy_ack' ? (
                  <button
                    onClick={() => uploadFile(item.item_key, new File(['ack'], 'ack.txt'))}
                    className="text-xs font-medium bg-orange-50 text-orange-700 px-3 py-1.5 rounded-lg"
                  >
                    Mark as complete
                  </button>
                ) : (
                  <input
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) uploadFile(item.item_key, file)
                    }}
                    className="text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-orange-50 file:text-orange-700"
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function SignaturePad({ onSign }: { onSign: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasDrawn, setHasDrawn] = useState(false)

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.stroke()
    setHasDrawn(true)
  }

  function end() {
    drawing.current = false
  }

  function clear() {
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height)
    setHasDrawn(false)
  }

  function submit() {
    const dataUrl = canvasRef.current!.toDataURL('image/png')
    onSign(dataUrl)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={320}
        height={120}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="border border-slate-200 rounded-lg bg-white w-full touch-none"
      />
      <div className="flex gap-2 mt-2">
        <button onClick={clear} className="text-xs text-slate-500 px-2 py-1">Clear</button>
        <button
          onClick={submit}
          disabled={!hasDrawn}
          className="text-xs font-medium bg-orange-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
        >
          Sign contract
        </button>
      </div>
    </div>
  )
}
