import ScheduleForm from '@/components/ScheduleForm'

export default function SchedulePage({ params }: { params: { token: string } }) {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <h1 className="text-xl font-bold text-slate-900">Book your interview</h1>
          <p className="text-slate-500 text-sm mt-1">Pick a time that works for you.</p>
          <div className="mt-6">
            <ScheduleForm token={params.token} />
          </div>
        </div>
      </div>
    </div>
  )
}
