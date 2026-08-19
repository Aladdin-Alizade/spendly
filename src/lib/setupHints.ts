/**
 * Backend errors, translated into the step that fixes them.
 *
 * Every one of these is something that cannot be done from inside the app —
 * it needs the Supabase dashboard — so echoing the raw API message at someone
 * who has just connected a project tells them nothing they can act on.
 *
 * Order matters: the first match wins, so the specific patterns come before
 * the general ones.
 */
const SETUP_HINTS: { match: RegExp; hint: string }[] = [
  {
    // Sign-up is off by default on some projects, which makes the register
    // form fail with nothing the user can do about it from inside the app.
    match: /signups not allowed|signup is disabled/i,
    hint: 'Qeydiyyat Supabase panelində bağlıdır. Authentication → Sign In / Providers bölməsindən Email provayderini və qeydiyyatı aktiv edin.',
  },
  {
    match: /hesaba daxil olunmayıb|not signed in|JWT|session/i,
    hint: 'Sessiya bitib. Yenidən daxil olun.',
  },
  {
    // 42703 is Postgres, PGRST204 is PostgREST's schema cache. Both mean the
    // table is there but is an older version of it than the app expects.
    match: /42703|PGRST204|column .* does not exist|could not find the .* column/i,
    hint: 'Verilənlər bazası köhnə quruluşdadır. Supabase SQL redaktorunda supabase/schema.sql faylını yenidən işə salın — təkrar işə salmaq təhlükəsizdir.',
  },
  {
    match: /could not find the table|PGRST205|relation .* does not exist|does not exist/i,
    hint: 'Cədvəlləri yaratmaq üçün Supabase SQL redaktorunda supabase/schema.sql faylını işə salın.',
  },
  {
    match: /row-level security|RLS|permission denied/i,
    hint: 'Sətir səviyyəsində icazələr tətbiq olunmayıb. supabase/schema.sql faylını yenidən işə salın.',
  },
  {
    match: /failed to fetch|network|ENOTFOUND/i,
    hint: 'İnternet bağlantınızı və VITE_SUPABASE_URL dəyərini yoxlayın.',
  },
]

/**
 * Everything useful out of a thrown value, whatever shape it arrived in.
 *
 * A rejection here can be a plain `Error`, a PostgREST error object carrying
 * `code`, `details` and `hint`, an auth error, or a bare string. Reading only
 * `.message` off an `Error` — and giving up on anything that is not one —
 * throws away the part that says what to do: PostgREST puts the actionable fix
 * in `hint`, and the code is what identifies the failure.
 *
 * Returns an empty string when there is genuinely nothing to report, so the
 * caller can fall back to saying only that the write failed.
 */
export function describeError(cause: unknown): string {
  if (typeof cause === 'string') return cause.trim()
  if (typeof cause !== 'object' || cause === null) return ''

  const error = cause as {
    message?: unknown
    details?: unknown
    hint?: unknown
    code?: unknown
  }

  const text = (value: unknown): string =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : ''

  // Ordered by how much each part helps: what happened, then what to do.
  const parts = [text(error.message), text(error.details), text(error.hint)]
    // The same sentence often arrives in two fields; say it once.
    .filter((part, index, all) => part !== '' && all.indexOf(part) === index)

  const code = text(error.code)
  if (parts.length === 0) return code
  return code === '' ? parts.join(' — ') : `${code}: ${parts.join(' — ')}`
}

/** The setup step that fixes `message`, or nothing when none of them do. */
export function setupHint(message: string | null | undefined): string | undefined {
  if (!message) return undefined
  return SETUP_HINTS.find((entry) => entry.match.test(message))?.hint
}
