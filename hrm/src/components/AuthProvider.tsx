'use client'
import {
    createContext,
    useContext,
    useEffect,
    useState,
    ReactNode,
} from 'react'
import { onIdTokenChanged, User } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { createClient } from '@/lib/supabase/client'

interface AuthContextValue {
    user: User | null
    loading: boolean
}

const AuthContext = createContext<AuthContextValue>({
    user: null,
    loading: true,
})

export function useAuth() {
    return useContext(AuthContext)
}

async function syncWithSupabase(firebaseUser: User) {
    try {
          const idToken = await firebaseUser.getIdToken()
          const supabase = createClient()
          await supabase.auth.signInWithIdToken({
                  provider: 'firebase' as never,
                  token: idToken,
          })
    } catch (err) {
          console.error('Supabase sync failed:', err)
    }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)

  useEffect(() => {
        const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
                if (firebaseUser) {
                          await syncWithSupabase(firebaseUser)
                          setUser(firebaseUser)
                } else {
                          const supabase = createClient()
                          await supabase.auth.signOut()
                          setUser(null)
                }
                setLoading(false)
        })
        return unsubscribe
  }, [])

  return (
        <AuthContext.Provider value={{ user, loading }}>
          {!loading && children}
        </AuthContext.Provider>AuthContext.Provider>
      )
}
