'use client'
import { signOut } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { auth } from '@/lib/firebase'

export function LogoutButton() {
    const router = useRouter()

  async function handleLogout() {
        await signOut(auth)
        router.replace('/login')
  }

  return (
        <button
                onClick={handleLogout}
                className="text-sm text-gray-600 hover:text-red-600 transition"
              >
              Sign out
        </button>
      )
}
