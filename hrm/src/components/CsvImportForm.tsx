'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CsvImportForm() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [source, setSource] = useState('csv_import')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)

  async function handleImport() {
    if (!file) return
    setSubmitting(true)
    setResult(null)

    const csv = await file.text()
    const res = await fetch('/api/candidates/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv, source }),
    })
    const data = await res.json()
    setResult(data)
    setSubmitting(false)
    router.refresh()
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <div>
        <label className="block text-sm text-slate-600 mb-1.5">
          CSV file (columns: first_name, last_name, email, phone, country, preferred_role, experience_years)
        </label>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-orange-50 file:text-orange-700"
        />
      </div>
      <div>
        <label className="block text-sm text-slate-600 mb-1.5">Source label</label>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="facebook_group">Facebook group</option>
          <option value="referral">Referral</option>
          <option value="csv_import">Other / manual list</option>
        </select>
      </div>
      <button
        onClick={handleImport}
        disabled={!file || submitting}
        className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-50"
      >
        {submitting ? 'Importing…' : 'Import candidates'}
      </button>

      {result && (
        <div className="text-sm bg-slate-50 rounded-lg p-4 space-y-1">
          <p className="text-emerald-600 font-medium">{result.imported} imported</p>
          {result.skipped > 0 && <p className="text-amber-600">{result.skipped} skipped</p>}
          {result.errors.length > 0 && (
            <ul className="text-red-600 text-xs list-disc pl-4">
              {result.errors.slice(0, 10).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
