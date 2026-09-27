import OfferResponse from '@/components/OfferResponse'

export default function OfferPage({ params }: { params: { token: string } }) {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <OfferResponse token={params.token} />
        </div>
      </div>
    </div>
  )
}
