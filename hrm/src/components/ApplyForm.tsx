'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ApplyForm({ jobSlug, jobTitle }: { jobSlug: string; jobTitle: string }) {
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const supabase = createClient()
      const form = e.currentTarget
      const data = new FormData(form)

      let cvFilePath: string | null = null
      let cvFileName: string | null = null

      if (file && supabase) {
        const ext = file.name.split('.').pop()
        const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('cvs')
          .upload(path, file, { cacheControl: '3600', upsert: false })
        if (upErr) throw new Error('CV upload failed: ' + upErr.message)
        cvFilePath = path
        cvFileName = file.name
      }

      const params = new URLSearchParams(window.location.search)

      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_slug: jobSlug,
          first_name: data.get('first_name'),
          last_name: data.get('last_name'),
          email: data.get('email'),
          phone: data.get('phone'),
          country: data.get('country'),
          relocation_pref: data.get('relocation_pref'),
          experience_years: data.get('experience_years'),
          salary_expectation: data.get('salary_expectation'),
          cv_file_path: cvFilePath,
          cv_file_name: cvFileName,
          consent: data.get('consent') === 'on',
          referral_code: params.get('ref'),
        }),
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Application failed')
      }

      setSuccess(true)
      form.reset()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-3">✅</div>
        <h3 className="text-lg font-semibold text-slate-900">Application received</h3>
        <p className="text-slate-500 text-sm mt-2">
          Thanks for applying to {jobTitle}. We will call you shortly.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <input name="first_name" required placeholder="First name" className="input" />
        <input name="last_name" required placeholder="Last name" className="input" />
      </div>
      <input name="email" type="email" required placeholder="Email" className="input" />
      <input name="phone" required placeholder="Phone (+92...)" className="input" />
      <div className="grid grid-cols-2 gap-4">
        <input name="country" placeholder="Country" defaultValue="Pakistan" className="input" />
        <select name="relocation_pref" className="input">
          <option value="">Relocation preference</option>
          <option value="no">Not willing to relocate</option>
          <option value="domestic">Domestic relocation OK</option>
          <option value="international">Open to international relocation</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <input name="experience_years" placeholder="Years of experience" className="input" />
        <input name="salary_expectation" placeholder="Salary expectation (PKR)" className="input" />
      </div>
      <div>
        <label className="block text-sm text-slate-600 mb-1.5">Upload CV (optional)</label>
        <input
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-orange-50 file:text-orange-700"
        />
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-600">
        <input type="checkbox" name="consent" required className="mt-1" />
        I consent to Assorted Group storing and processing my information for recruitment purposes.
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Submit application'}
      </button>
      <style jsx>{`
        .input {
          width: 100%;
          border: 1px solid #e2e8f0;
          border-radius: 0.5rem;
          padding: 0.625rem 0.875rem;
          font-size: 0.875rem;
        }
        .input:focus {
          outline: none;
          border-color: #f97316;
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.1);
        }
      `}</style>
    </form>
  )
}
