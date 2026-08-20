/**
 * The merge rule: rows this device changed while it could not reach the
 * server win; every other row comes from the server.
 *
 * These are the cases that decide whether offline work survives, so each one
 * is written as the situation it stands for rather than as a shape.
 */
import { describe, expect, it } from 'vitest'
import { hasPendingWork, mergeFinanceData, mergeRows } from '../merge'
import { emptyData } from '../storage'
import { sheetCategories } from './fixtures'
import type { CategoryDef, FinanceData, Transaction } from '../types'

const tx = (id: string, amount = 10, description = 'Test'): Transaction => ({
  id,
  date: '2026-08-05',
  type: 'expense',
  category: 'Ərzaq',
  description,
  amount,
})

const ids = <T>(rows: T[], idOf: (row: T) => string) => rows.map(idOf)

describe('mergeRows', () => {
  it('keeps a row this device edited offline', () => {
    const merged = mergeRows(
      [tx('a'), tx('b')],
      [tx('a', 99), tx('b')],
      [tx('a'), tx('b')],
      (t) => t.id,
    )
    expect(merged.find((t) => t.id === 'a')?.amount).toBe(99)
  })

  it('takes a row another device changed', () => {
    const merged = mergeRows(
      [tx('a'), tx('b')],
      [tx('a'), tx('b')],
      [tx('a'), tx('b', 55)],
      (t) => t.id,
    )
    expect(merged.find((t) => t.id === 'b')?.amount).toBe(55)
  })

  it('carries a row added offline over to the merged list', () => {
    const merged = mergeRows([tx('a')], [tx('a'), tx('new')], [tx('a')], (t) => t.id)
    expect(ids(merged, (t) => t.id)).toEqual(['a', 'new'])
  })

  it('honours a deletion made offline', () => {
    const merged = mergeRows([tx('a'), tx('b')], [tx('a')], [tx('a'), tx('b')], (t) => t.id)
    expect(ids(merged, (t) => t.id)).toEqual(['a'])
  })

  it('accepts a row another device deleted, when this one did not touch it', () => {
    const merged = mergeRows([tx('a'), tx('b')], [tx('a'), tx('b')], [tx('a')], (t) => t.id)
    expect(ids(merged, (t) => t.id)).toEqual(['a'])
  })

  it('keeps a row this device edited even after another deleted it', () => {
    // Two devices disagreeing about one row: the edit is work somebody did and
    // can see on screen, and a deletion elsewhere is not a reason to discard it
    // without saying so.
    const merged = mergeRows(
      [tx('a'), tx('b')],
      [tx('a'), tx('b', 42)],
      [tx('a')],
      (t) => t.id,
    )
    expect(ids(merged, (t) => t.id)).toEqual(['a', 'b'])
    expect(merged.find((t) => t.id === 'b')?.amount).toBe(42)
  })

  it("follows the server's order, with local additions at the end", () => {
    const merged = mergeRows([], [tx('local')], [tx('x'), tx('y')], (t) => t.id)
    expect(ids(merged, (t) => t.id)).toEqual(['x', 'y', 'local'])
  })
})

describe('mergeFinanceData', () => {
  const base: FinanceData = {
    transactions: [tx('a')],
    budgetLines: [
      { id: 'b1', month: '2026-08', description: 'Ev', category: 'Əlavə xərclər', planned: 230 },
    ],
    incomePlans: [{ month: '2026-08', amounts: { 'Maaş': 990 } }],
    categories: sheetCategories(),
    savingsPots: [],
    savingsEntries: [],
    savingsPlans: [],
  }

  it('merges every collection, each by its own identity', () => {
    const local: FinanceData = {
      ...base,
      // Added on the phone with no signal.
      transactions: [...base.transactions, tx('offline', 25)],
      incomePlans: [{ month: '2026-08', amounts: { 'Maaş': 1200 } }],
    }
    const remote: FinanceData = {
      ...base,
      // Added in the browser meanwhile.
      transactions: [...base.transactions, tx('browser', 60)],
      budgetLines: [
        ...base.budgetLines,
        {
          id: 'b2',
          month: '2026-08',
          description: 'İnternet',
          category: 'Telefon və internet',
          planned: 15,
        },
      ],
    }

    const merged = mergeFinanceData(base, local, remote)

    expect(ids(merged.transactions, (t) => t.id)).toEqual(['a', 'browser', 'offline'])
    expect(ids(merged.budgetLines, (l) => l.id)).toEqual(['b1', 'b2'])
    // The plan was edited here, so this device's figure stands.
    expect(merged.incomePlans[0].amounts).toEqual({ 'Maaş': 1200 })
  })

  it('is the server state when this device has nothing unsent', () => {
    const remote = { ...base, transactions: [...base.transactions, tx('elsewhere')] }
    expect(mergeFinanceData(base, base, remote)).toEqual(remote)
  })

  it('hands the whole account back after storage has been cleared', () => {
    // Clearing site data takes the snapshots with it, so a browser starting
    // over holds nothing and has no baseline either. Nothing was deleted here
    // — there is no baseline to have deleted it from — so every row on the
    // server comes back untouched.
    expect(mergeFinanceData(emptyData, emptyData, base)).toEqual(base)
  })

  it('does not resurrect what was deleted before the storage was cleared', () => {
    // The mirror of the case above, and the one that would be a bug: a row the
    // account no longer has must not reappear just because this browser is
    // starting from nothing.
    const merged = mergeFinanceData(emptyData, emptyData, base)
    expect(merged.transactions.some((t) => t.id === 'gone')).toBe(false)
    expect(ids(merged.transactions, (t) => t.id)).toEqual(ids(base.transactions, (t) => t.id))
  })
})

describe('hasPendingWork', () => {
  const data: FinanceData = {
    transactions: [tx('a')],
    budgetLines: [],
    incomePlans: [],
    categories: [],
    savingsPots: [],
    savingsEntries: [],
    savingsPlans: [],
  }

  it('is nothing when the device matches the last sync', () => {
    expect(hasPendingWork(data, data)).toBe(false)
  })

  it('is something after an edit', () => {
    expect(hasPendingWork(data, { ...data, transactions: [tx('a', 12)] })).toBe(true)
  })
})

describe('the same category under two ids', () => {
  const category = (id: string, name: string): CategoryDef => ({
    id,
    name,
    type: 'expense',
  })

  const data = (categories: CategoryDef[]): FinanceData => ({
    transactions: [],
    budgetLines: [],
    incomePlans: [],
    categories,
    savingsPots: [],
    savingsEntries: [],
    savingsPlans: [],
  })

  it('resolves it in favour of the server', () => {
    // A browser that never synced made its own categories; the account was
    // used elsewhere first and holds the same names under other ids. Sending
    // both is what the server rejects outright.
    const merged = mergeFinanceData(
      data([]),
      data([category('cat-expense-0', 'Ərzaq')]),
      data([category('uuid-1', 'Ərzaq')]),
    )

    expect(merged.categories).toHaveLength(1)
    expect(merged.categories[0].id).toBe('uuid-1')
  })

  it('matches by name regardless of case or padding', () => {
    const merged = mergeFinanceData(
      data([]),
      data([category('a', ' ərzaq ')]),
      data([category('b', 'Ərzaq')]),
    )
    expect(merged.categories).toHaveLength(1)
  })

  it('leaves the same name on the other side of the ledger alone', () => {
    // An expense and an income category may share a name; nothing looks a
    // category up without its type.
    const merged = mergeFinanceData(
      data([]),
      data([
        { id: 'a', name: 'Bonus', type: 'expense' },
        { id: 'b', name: 'Bonus', type: 'income' },
      ]),
      data([]),
    )
    expect(merged.categories).toHaveLength(2)
  })

  it('carries the rows of the dropped spelling onto the one that survives', () => {
    // The server keeps names apart by exact spelling, the app by name
    // regardless of case — so the two devices can each be right and still hold
    // 'ərzaq' and 'Ərzaq'. Dropping the definition alone left this browser's
    // transactions naming a category the picker no longer offered, and opening
    // one of them asked for a category that could not be chosen.
    const merged = mergeFinanceData(
      data([]),
      {
        ...data([category('a', 'ərzaq')]),
        transactions: [{ ...tx('t1', 40), category: 'ərzaq' }],
        budgetLines: [
          { id: 'b1', month: '2026-08', description: 'Bazarlıq', category: 'ərzaq', planned: 300 },
        ],
      },
      data([category('b', 'Ərzaq')]),
    )

    expect(merged.categories.map((c) => c.name)).toEqual(['Ərzaq'])
    expect(merged.transactions[0].category).toBe('Ərzaq')
    expect(merged.budgetLines[0].category).toBe('Ərzaq')
  })

  it('carries a planned income figure onto the surviving spelling', () => {
    const income = (id: string, name: string): CategoryDef => ({ id, name, type: 'income' })
    const merged = mergeFinanceData(
      data([]),
      {
        ...data([income('a', 'maaş')]),
        incomePlans: [{ month: '2026-08', amounts: { 'maaş': 990 } }],
      },
      data([income('b', 'Maaş')]),
    )

    expect(merged.incomePlans[0].amounts).toEqual({ 'Maaş': 990 })
  })
})

describe('the same pot under two ids', () => {
  const empty: FinanceData = {
    transactions: [],
    budgetLines: [],
    incomePlans: [],
    categories: [],
    savingsPots: [],
    savingsEntries: [],
    savingsPlans: [],
  }

  it('carries the entries and the plan of the dropped pot onto the survivor', () => {
    // A pot is unique by name on the server and every entry names its pot, so
    // the same collision has the same answer — and the same duty to take
    // everything that named the loser with it.
    const merged = mergeFinanceData(
      empty,
      {
        ...empty,
        savingsPots: [{ id: 'a', name: 'ehtiyat fondu' }],
        savingsEntries: [
          {
            id: 'e1',
            date: '2026-08-05',
            pot: 'ehtiyat fondu',
            amount: 400,
            direction: 'in',
            source: 'income',
          },
        ],
        savingsPlans: [{ month: '2026-08', amounts: { 'ehtiyat fondu': 400 } }],
      },
      { ...empty, savingsPots: [{ id: 'b', name: 'Ehtiyat fondu' }] },
    )

    expect(merged.savingsPots.map((p) => p.name)).toEqual(['Ehtiyat fondu'])
    expect(merged.savingsEntries[0].pot).toBe('Ehtiyat fondu')
    expect(merged.savingsPlans[0].amounts).toEqual({ 'Ehtiyat fondu': 400 })
  })
})
