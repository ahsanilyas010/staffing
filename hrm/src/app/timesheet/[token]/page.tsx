import TimesheetForm from '@/components/TimesheetForm'

export default function TimesheetPage({ params }: { params: { token: string } }) {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <TimesheetForm token={params.token} />
        </div>
      </div>
    </div>
  )
}
