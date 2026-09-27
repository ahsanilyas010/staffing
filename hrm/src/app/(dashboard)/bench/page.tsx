import BenchSearch from '@/components/BenchSearch'

export default function BenchPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Bench</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Shortlisted candidates without an active placement — search by skills, city, or salary.
        </p>
      </div>
      <BenchSearch />
    </div>
  )
}
