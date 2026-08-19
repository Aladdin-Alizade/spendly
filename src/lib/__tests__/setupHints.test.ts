import { describe, expect, it } from 'vitest'
import { setupHint } from '../setupHints'

describe('setupHint', () => {
  it('has nothing to say about nothing', () => {
    expect(setupHint(null)).toBeUndefined()
    expect(setupHint('')).toBeUndefined()
    expect(setupHint('something entirely unrelated')).toBeUndefined()
  })

  it('names the provider setting for a disabled anonymous sign-in', () => {
    expect(setupHint('Anonymous sign-ins are disabled')).toMatch(/Anonymous sign-ins/)
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
