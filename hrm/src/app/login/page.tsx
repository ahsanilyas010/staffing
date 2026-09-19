'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const [resetSent, setResetSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
      router.push('/pipeline')
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign in failed'
      setError(msg.replace('Firebase: ', '').replace(/ \(auth\/.*\)\.?/, ''))
      setLoading(false)
    }
  }

  async function handleReset() {
    if (!email) {
      setError('Enter your email first, then click "Forgot password"')
      return
    }
    try {
      await sendPasswordResetEmail(auth, email)
      setResetSent(true)
      setError(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reset failed'
      setError(msg.replace('Firebase: ', '').replace(/ \(auth\/.*\)\.?/, ''))
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 to-brand-600">
      <div className="card w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Assorted Staffing</h1>
          <p className="text-slate-500 mt-1 text-sm">HR Management Portal</p>
        </div>

        {resetSent ? (
          <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 text-center">
            Password reset email sent — check your inbox.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="hr@assorted.group"
              />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}
            <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-600 transition"
            >
              Forgot password?
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
