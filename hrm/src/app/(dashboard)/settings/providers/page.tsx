const providers = [
  { name: 'Supabase', vars: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] },
  { name: 'Anthropic (scoring)', vars: ['ANTHROPIC_API_KEY'] },
  { name: 'Vapi (voice)', vars: ['VAPI_API_KEY', 'VAPI_PHONE_NUMBER_ID', 'VAPI_ASSISTANT_ID', 'VAPI_WEBHOOK_SECRET'] },
  { name: 'Twilio (SMS/WhatsApp)', vars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_SMS_FROM', 'TWILIO_WHATSAPP_FROM'] },
  { name: 'Resend (email)', vars: ['RESEND_API_KEY', 'EMAIL_FROM'] },
  { name: 'Google Calendar', vars: ['GOOGLE_CALENDAR_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_SECRET', 'GOOGLE_CALENDAR_REFRESH_TOKEN'] },
  { name: 'Embeddings (bench search)', vars: ['EMBEDDINGS_API_KEY'] },
  { name: 'Cron / background jobs', vars: ['CRON_SECRET'] },
]

export default function ProvidersSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Provider Setup</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Live check of which integrations are configured. Values are never displayed — only whether they're set.
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Provider</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Environment variables</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {providers.map((p) => {
              const allSet = p.vars.every((v) => !!process.env[v])
              return (
                <tr key={p.name}>
                  <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{p.vars.join(', ')}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${allSet ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                      {allSet ? 'Configured' : 'Missing values'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
