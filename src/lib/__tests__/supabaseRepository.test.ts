import { describe, expect, it } from 'vitest'
import { changedRows } from '../supabaseRepository'
import type { Transaction } from '../types'

/**
 * The store hands down a whole snapshot on every change, so the repository has
 * to work out what actually moved. Getting this wrong either loses edits or
 * rewrites the entire history on every keystroke.
 */

const row = (transaction: Transaction) => ({
  id: transaction.id,
  date: transaction.date,
  amount: transaction.amount,
  description: transaction.description,
})

function tx(id: string, over: Partial<Transaction> = {}): Transaction {
  return {
    id,
    date: '2026-08-05',
    type: 'expense',
    category: 'Ərzaq',
    description: 'Test',
    amount: 10,
    ...over,
  }
}

describe('change detection', () => {
  it('writes nothing when nothing changed', () => {
    const items = [tx('a'), tx('b')]
    const diff = changedRows(items, items, row)
    expect(diff.upserts).toEqual([])
    expect(diff.removed).toEqual([])
  })

  it('leaves untouched rows alone when a sibling changes', () => {
    const before = [tx('a'), tx('b'), tx('c')]
    const after = [tx('a'), tx('b', { amount: 99 }), tx('c')]
    const diff = changedRows(before, after, row)
    expect(diff.upserts).toHaveLength(1)
    expect(diff.upserts[0]).toMatchObject({ id: 'b', amount: 99 })
    expect(diff.removed).toEqual([])
  })

  it('upserts a new row', () => {
    const diff = changedRows([tx('a')], [tx('a'), tx('b')], row)
    expect(diff.upserts.map((r) => r.id)).toEqual(['b'])
  })

  it('reports a removed id', () => {
    const diff = changedRows([tx('a'), tx('b')], [tx('a')], row)
    expect(diff.removed).toEqual(['b'])
    expect(diff.upserts).toEqual([])
  })

  it('handles an add, an edit and a delete in one snapshot', () => {
    const before = [tx('a'), tx('b'), tx('c')]
    const after = [tx('a', { description: 'Renamed' }), tx('c'), tx('d')]
    const diff = changedRows(before, after, row)
    expect(diff.upserts.map((r) => r.id).sort()).toEqual(['a', 'd'])
    expect(diff.removed).toEqual(['b'])
  })

  it('detects a change in every persisted field', () => {
    const fields: Partial<Transaction>[] = [
      { amount: 11 },
      { date: '2026-08-06' },
      { description: 'Other' },
    ]
    for (const change of fields) {
      const diff = changedRows([tx('a')], [tx('a', change)], row)
      expect(diff.upserts).toHaveLength(1)
    }
  })

  it('clears everything when the last row goes', () => {
    const diff = changedRows([tx('a'), tx('b')], [], row)
    expect(diff.removed.sort()).toEqual(['a', 'b'])
    expect(diff.upserts).toEqual([])
  })

  it('treats a first load into an empty baseline as all inserts', () => {
    const diff = changedRows([], [tx('a'), tx('b')], row)
    expect(diff.upserts).toHaveLength(2)
    expect(diff.removed).toEqual([])
  })

  it('is not confused by reordering', () => {
    const diff = changedRows([tx('a'), tx('b')], [tx('b'), tx('a')], row)
    expect(diff.upserts).toEqual([])
    expect(diff.removed).toEqual([])
  })
})
