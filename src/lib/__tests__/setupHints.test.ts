import { describe, expect, it } from 'vitest'
import { describeError, setupHint } from '../setupHints'

describe('setupHint', () => {
  it('has nothing to say about nothing', () => {
    expect(setupHint(null)).toBeUndefined()
    expect(setupHint('')).toBeUndefined()
    expect(setupHint('something entirely unrelated')).toBeUndefined()
  })

  it('names the provider setting when sign-up is closed', () => {
    // Nothing the user can do from inside the app, so the hint has to name the
    // dashboard setting.
    expect(setupHint('Signups not allowed for this instance')).toMatch(
      /Sign In \/ Providers/,
    )
  })

  it('says to sign in again when the session has gone', () => {
    expect(setupHint('Hesaba daxil olunmayıb')).toMatch(/Yenidən daxil olun/)
  })

  it('asks for a re-run when a column is missing, not a first-time setup', () => {
    // The exact error behind "income amounts are not saved": the table exists,
    // but predates the column the app writes to.
    const hint = setupHint('column income_plans.amounts does not exist')
    expect(hint).toMatch(/yenidən işə salın/)

    expect(setupHint('42703')).toBe(hint)
    expect(
      setupHint("Could not find the 'amounts' column of 'income_plans' in the schema cache"),
    ).toBe(hint)
    expect(setupHint('PGRST204')).toBe(hint)

    // An upsert naming (user_id, id) against a table still keyed on the id
    // alone. Same cause, same fix, and the raw message names neither.
    expect(
      setupHint('there is no unique or exclusion constraint matching the ON CONFLICT specification'),
    ).toBe(hint)
    expect(setupHint('42P10')).toBe(hint)
  })

  it('asks for a first-time setup when the table itself is missing', () => {
    const hint = setupHint('Could not find the table public.categories')
    expect(hint).toMatch(/schema\.sql/)
    expect(hint).not.toMatch(/yenidən/)
    expect(setupHint('PGRST205')).toBe(hint)
  })

  it('does not let the general rule shadow the specific one', () => {
    // Both patterns match this string; the column rule has to win.
    expect(setupHint('column income_plans.amounts does not exist')).not.toBe(
      setupHint('relation public.categories does not exist'),
    )
  })

  it('covers permissions and connectivity', () => {
    expect(setupHint('new row violates row-level security policy')).toBeDefined()
    expect(setupHint('Failed to fetch')).toMatch(/VITE_SUPABASE_URL/)
  })
})

describe('describeError', () => {
  it('reads a plain Error', () => {
    expect(describeError(new Error('boom'))).toBe('boom')
  })

  it('reads a string', () => {
    expect(describeError('  boom  ')).toBe('boom')
  })

  it('keeps the code, the message and the hint of a PostgREST error', () => {
    // The shape supabase-js rejects with. `hint` is where Postgres puts the
    // actionable fix, so losing it loses the only part that says what to do.
    const described = describeError({
      message: 'column income_plans.amounts does not exist',
      details: '',
      hint: 'Perhaps you meant to reference the column "income_plans.month".',
      code: '42703',
    })

    expect(described).toContain('42703')
    expect(described).toContain('column income_plans.amounts does not exist')
    expect(described).toContain('Perhaps you meant')
  })

  it('still finds the message on an object that is not an Error', () => {
    // The case that produced a banner saying nothing: a rejection that failed
    // an `instanceof Error` check had its message thrown away.
    expect(describeError({ message: 'Failed to fetch' })).toBe('Failed to fetch')
  })

  it('does not say the same sentence twice', () => {
    expect(describeError({ message: 'same', details: 'same', hint: 'same' })).toBe('same')
  })

  it('falls back to the code when there is no prose', () => {
    expect(describeError({ code: 'PGRST204', message: '', hint: null })).toBe('PGRST204')
  })

  it('reports nothing rather than inventing something', () => {
    expect(describeError(null)).toBe('')
    expect(describeError(undefined)).toBe('')
    expect(describeError({})).toBe('')
    expect(describeError(42)).toBe('')
  })

  it('produces something setupHint can still match', () => {
    const described = describeError({
      message: "Could not find the 'amounts' column of 'income_plans' in the schema cache",
      code: 'PGRST204',
    })
    expect(setupHint(described)).toMatch(/yenidən işə salın/)
  })
})
