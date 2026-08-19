/**
 * Supabase client.
 *
 * Lives in `src/lib` with the rest of the non-UI code rather than in `utils/`,
 * so the whole data layer stays in one place.
 *
 * The publishable key is designed to ship in a browser bundle. It is not a
 * secret, and it is not what protects the data — row level security is. Every
 * table is scoped to `auth.uid()`, so this key alone reads nothing.
 */

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/** False when the env vars are absent, so the app can fall back to local data. */
export const isSupabaseConfigured = Boolean(url && key)

export const supabase = isSupabaseConfigured
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null

/**
 * Authentication.
 *
 * Every row belongs to a user, so there has to be one before any read or
 * write — the RLS policies match `auth.uid()` and nothing else.
 *
 * This used to be an anonymous sign-in, which meant the identity lived in
 * browser storage: clearing site data, or opening the app elsewhere, minted a
 * new user and the previous rows became invisible under RLS. They were still
 * in the tables, owned by an id nothing could produce again. An email account
 * ties the data to something the user can present from any browser.
 */

/** What the app shows about the person signed in. Nothing else is read. */
export interface AccountUser {
  id: string
  email: string | null
  /** ISO timestamp the account was created. */
  createdAt: string | null
}

/** The signed-in user, or null when nobody is signed in. */
export async function currentUser(): Promise<AccountUser | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return toAccountUser(data.session?.user ?? null)
}

/** The signed-in user's id, or null when nobody is signed in. */
export async function currentUserId(): Promise<string | null> {
  return (await currentUser())?.id ?? null
}

function toAccountUser(user: {
  id: string
  email?: string
  created_at?: string
} | null): AccountUser | null {
  if (!user) return null
  return {
    id: user.id,
    email: user.email ?? null,
    createdAt: user.created_at ?? null,
  }
}

export interface SignUpResult {
  /** False when Supabase is set to confirm addresses before the first sign-in. */
  signedIn: boolean
}

export async function signUp(email: string, password: string): Promise<SignUpResult> {
  const client = requireAuth()
  const { data, error } = await client.auth.signUp({ email, password })
  if (error) throw error
  // With email confirmation on, Supabase creates the user but no session; the
  // caller has to say so rather than dropping the user on an empty screen.
  return { signedIn: data.session !== null }
}

export async function signIn(email: string, password: string): Promise<void> {
  const client = requireAuth()
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  const client = requireAuth()
  const { error } = await client.auth.signOut()
  if (error) throw error
}

/** Fires on sign-in, sign-out and token refresh. Returns an unsubscribe. */
export function onAuthChange(listener: (user: AccountUser | null) => void): () => void {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    listener(toAccountUser(session?.user ?? null))
  })
  return () => data.subscription.unsubscribe()
}

function requireAuth() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}
