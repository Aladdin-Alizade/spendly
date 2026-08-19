/**
 * The merge rule: rows this device changed while it could not reach the
 * server win; every other row comes from the server.
 *
 * These are the cases that decide whether offline work survives, so each one
 * is written as the situation it stands for rather than as a shape.
 */
import { describe, expect, it } from 'vitest'
import { hasPendingWork, mergeFinanceData, mergeRows } from '../merge'
import { defaultCategories } from '../types'
import type { FinanceData, Transaction } from '../types'

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
    categories: defaultCategories(),
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
})

describe('hasPendingWork', () => {
  const data: FinanceData = {
    transactions: [tx('a')],
    budgetLines: [],
    incomePlans: [],
    categories: [],
  }

  it('is nothing when the device matches the last sync', () => {
    expect(hasPendingWork(data, data)).toBe(false)
  })

  it('is something after an edit', () => {
    expect(hasPendingWork(data, { ...data, transactions: [tx('a', 12)] })).toBe(true)
  })
})
