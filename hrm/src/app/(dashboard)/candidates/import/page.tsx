import CsvImportForm from '@/components/CsvImportForm'

export default function CandidatesImportPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Import Candidates</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Bulk import candidates from Facebook groups, referrals, or spreadsheets.
        </p>
      </div>
      <CsvImportForm />
    </div>
  )
}
