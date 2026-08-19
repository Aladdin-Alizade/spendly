import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  changePassword as changePasswordRequest,
  completePasswordReset as completePasswordResetRequest,
  currentUser,
  isSupabaseConfigured,
  onAuthChange,
  signIn as signInRequest,
  sendPasswordReset as sendPasswordResetRequest,
  signOut as signOutRequest,
  signUp as signUpRequest,
} from '../lib/supabase'
import type { AccountUser } from '../lib/supabase'
import { authErrorMessage } from '../lib/credentials'

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'not-required'

interface AuthContextValue {
  status: AuthStatus
  /** The signed-in user's id. Data is reloaded when this changes. */
  userId: string | null
  /** Who is signed in, for the profile. Null in local-storage mode. */
  user: AccountUser | null
  /** Set after a sign-up that needs the address confirmed before signing in. */
  notice: string | null
  /**
   * True while the session came from a reset link and the password it was
   * opened to set has not been set yet.
   */
  recovering: boolean
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string): Promise<void>
  /** Rejects with a message in the user's own language when it fails. */
  changePassword(currentPassword: string, nextPassword: string): Promise<void>
  /** Email a reset link. Resolves whether or not the address has an account,
   *  because saying which addresses exist is telling. */
  sendPasswordReset(email: string): Promise<void>
  /** Set the password the reset link was opened to set. */
  completePasswordReset(nextPassword: string): Promise<void>
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
  const [user, setUser] = useState<AccountUser | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) return

    let cancelled = false
    currentUser().then((account) => {
      if (cancelled) return
      setUser(account)
      setStatus(account ? 'signed-in' : 'signed-out')
    })

    // Covers a token refresh, a sign-out in another tab, and an expired
    // session, so the app cannot keep showing data for a session that ended.
    const unsubscribe = onAuthChange((account, recovery) => {
      setUser(account)
      setStatus(account ? 'signed-in' : 'signed-out')
      if (account) setNotice(null)
      // A reset link signs the user in, so without this they would land on
      // the dashboard with the thing they came to do still undone.
      if (recovery) setRecovering(true)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      userId: user?.id ?? null,
      user,
      notice,
      recovering,

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

      async changePassword(currentPassword, nextPassword) {
        setNotice(null)
        try {
          await changePasswordRequest(currentPassword, nextPassword)
        } catch (cause) {
          throw new Error(authErrorMessage(messageOf(cause)))
        }
      },

      async sendPasswordReset(email) {
        setNotice(null)
        try {
          await sendPasswordResetRequest(email)
        } catch (cause) {
          throw new Error(authErrorMessage(messageOf(cause)))
        }
      },

      async completePasswordReset(nextPassword) {
        try {
          await completePasswordResetRequest(nextPassword)
          setRecovering(false)
        } catch (cause) {
          throw new Error(authErrorMessage(messageOf(cause)))
        }
      },

      async signOut() {
        setRecovering(false)
        await signOutRequest()
      },
    }),
    [status, user, notice, recovering],
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
