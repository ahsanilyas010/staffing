'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Candidate {
  id: string
  first_name: string
  last_name: string
  preferred_role: string | null
  experience_years: string | null
  salary_expectation: string | null
  country: string | null
  skills: string[] | null
  similarity?: number
}

export default function BenchSearch() {
  const [query, setQuery] = useState('')
  const [city, setCity] = useState('')
  const [salaryMax, setSalaryMax] = useState('')
  const [results, setResults] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  async function search() {
    setLoading(true)
    const res = await fetch('/api/bench/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query || undefined,
        city: city || undefined,
        salaryMaxPkr: salaryMax ? Number(salaryMax) : undefined,
      }),
    })
    const data = await res.json()
    setResults(data.results ?? [])
    setLoading(false)
    setSearched(true)
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 flex gap-3 flex-wrap">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search skills, role, background… (e.g. 'React developer with 3+ years')"
          className="input flex-1 min-w-[240px]"
        />
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="input max-w-[160px]" />
        <input
          value={salaryMax}
          onChange={(e) => setSalaryMax(e.target.value)}
          placeholder="Max salary (PKR)"
          className="input max-w-[180px]"
        />
        <button onClick={search} disabled={loading} className="btn-primary">
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Candidate</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Role</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Experience</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">City</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Salary</th>
              {results[0]?.similarity !== undefined && (
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Match</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {results.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/candidates/${c.id}`} className="font-medium text-slate-900 hover:text-brand-600">
                    {c.first_name} {c.last_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{c.preferred_role ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{c.experience_years ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{c.country ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{c.salary_expectation ?? '—'}</td>
                {c.similarity !== undefined && (
                  <td className="px-4 py-3 text-slate-600">{Math.round(c.similarity * 100)}%</td>
                )}
              </tr>
            ))}
            {searched && results.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400">No matching candidates on the bench</td>
              </tr>
            )}
            {!searched && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400">Search to see bench candidates</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
