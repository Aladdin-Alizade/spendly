import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  currentUserId,
  isSupabaseConfigured,
  onAuthChange,
  signIn as signInRequest,
  signOut as signOutRequest,
  signUp as signUpRequest,
} from '../lib/supabase'
import { authErrorMessage } from '../lib/credentials'

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'not-required'

interface AuthContextValue {
  status: AuthStatus
  /** The signed-in user's id. Data is reloaded when this changes. */
  userId: string | null
  /** Set after a sign-up that needs the address confirmed before signing in. */
  notice: string | null
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string): Promise<void>
  signOut(): Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Who is signed in.
 *
 * When Supabase is not configured the app runs on this browser's own storage,
 * where there is nobody to sign in as — the status is `not-required` and no
 * sign-in screen is ever shown.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(
    isSupabaseConfigured ? 'loading' : 'not-required',
  )
  const [userId, setUserId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) return

    let cancelled = false
    currentUserId().then((id) => {
      if (cancelled) return
      setUserId(id)
      setStatus(id ? 'signed-in' : 'signed-out')
    })

    // Covers a token refresh, a sign-out in another tab, and an expired
    // session, so the app cannot keep showing data for a session that ended.
    const unsubscribe = onAuthChange((id) => {
      setUserId(id)
      setStatus(id ? 'signed-in' : 'signed-out')
      if (id) setNotice(null)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      userId,
      notice,

      async signIn(email, password) {
        setNotice(null)
        try {
          await signInRequest(email.trim(), password)
        } catch (cause) {
          throw new Error(authErrorMessage(messageOf(cause)))
        }
      },

      async signUp(email, password) {
        setNotice(null)
        try {
          const { signedIn } = await signUpRequest(email.trim(), password)
          if (!signedIn) {
            setNotice(
              'Hesab yaradıldı. Daxil olmadan əvvəl e-poçtunuza gələn təsdiq linkini açın.',
            )
          }
        } catch (cause) {
          throw new Error(authErrorMessage(messageOf(cause)))
        }
      },

      async signOut() {
        await signOutRequest()
      },
    }),
    [status, userId, notice],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}

function messageOf(cause: unknown): string {
  if (typeof cause === 'string') return cause
  if (cause && typeof cause === 'object' && 'message' in cause) {
    return String((cause as { message: unknown }).message)
  }
  return 'Naməlum xəta'
}
