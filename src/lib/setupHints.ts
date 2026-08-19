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
    match: /anonymous sign-?ins?.*(disabled|not enabled)/i,
    hint: 'Supabase panelində Authentication → Sign In / Providers bölməsindən Anonymous sign-ins seçimini aktiv edin.',
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

/** The setup step that fixes `message`, or nothing when none of them do. */
export function setupHint(message: string | null | undefined): string | undefined {
  if (!message) return undefined
  return SETUP_HINTS.find((entry) => entry.match.test(message))?.hint
}
