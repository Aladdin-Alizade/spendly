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
 * Every row belongs to a user, so there has to be one before any read or write.
 *
 * Anonymous sign-in gives this browser a durable identity without a login
 * screen. Requires "Anonymous sign-ins" to be enabled in the Supabase
 * dashboard under Authentication -> Sign In / Providers.
 */
export async function ensureSession(): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured')

  const { data: existing } = await supabase.auth.getSession()
  if (existing.session?.user) return existing.session.user.id

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  if (!data.user) throw new Error('Could not establish a Supabase session')
  return data.user.id
}
