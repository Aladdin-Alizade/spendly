import { describe, expect, it } from 'vitest'
import {
  DELETE_KEYS,
  PAGE_ROWS,
  batched,
  changedRows,
  selectAll,
} from '../supabaseRepository'
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


/**
 * Reading a table that is longer than one answer.
 *
 * PostgREST caps a response at `db-max-rows` — Supabase ships that set to 1000
 * — and says nothing about having done it. One unpaged request therefore
 * looked like the whole table while being its first thousand rows, and the
 * merge wrote that back over the browser's own copy: an account with more
 * history than that watched a shifting subset of it appear and disappear.
 */
describe('reading every row', () => {
  /** A server that answers at most `cap` rows however many are asked for. */
  function server(total: number, cap = PAGE_ROWS) {
    const rows = Array.from({ length: total }, (_, index) => ({ id: `r${index}` }))
    const ranges: [number, number][] = []

    const client = {
      from: () => ({
        select: (_columns: string, options?: { count?: 'exact' }) => ({
          order: () => ({
            range: (from: number, to: number) => {
              ranges.push([from, to])
              return Promise.resolve({
                data: rows.slice(from, Math.min(to + 1, from + cap)),
                error: null,
                count: options?.count === 'exact' ? total : null,
              })
            },
          }),
        }),
      }),
    }

    return { client, ranges }
  }

  it('reads a table that fits in one answer without asking twice', async () => {
    const { client, ranges } = server(3)
    const rows = await selectAll(client as never, 'transactions', 'id')

    expect(rows).toHaveLength(3)
    expect(ranges).toHaveLength(1)
  })

  it('stops on the row the server counted, not on a short page', async () => {
    // Exactly one page. The count is what says there is nothing after it, so
    // no second request goes out to find that out.
    const { client, ranges } = server(PAGE_ROWS)
    expect(await selectAll(client as never, 'transactions', 'id')).toHaveLength(PAGE_ROWS)
    expect(ranges).toHaveLength(1)
  })

  it('keeps going past the cap until it has the whole table', async () => {
    const { client, ranges } = server(2500)
    const rows = await selectAll(client as never, 'transactions', 'id')

    expect(rows).toHaveLength(2500)
    expect(rows[2499]).toEqual({ id: 'r2499' })
    expect(ranges[0][0]).toBe(0)
    expect(ranges[1][0]).toBe(PAGE_ROWS)
  })

  it('still finishes when the server caps below what was asked for', async () => {
    // A project with a smaller `db-max-rows` answers short every time, so a
    // short page cannot be read as the end of the table.
    const { client } = server(1200, 500)
    expect(await selectAll(client as never, 'transactions', 'id')).toHaveLength(1200)
  })

  it('reads an empty table as nothing rather than looping', async () => {
    const { client, ranges } = server(0)
    expect(await selectAll(client as never, 'transactions', 'id')).toEqual([])
    expect(ranges).toHaveLength(1)
  })
})

/**
 * The keys of a delete travel in the URL, which is the short one: "delete
 * everything" on a real history built a request line long enough for the
 * gateway to refuse it outright.
 */
describe('batching what goes out', () => {
  it('splits a list into whole batches with a remainder', () => {
    expect(batched([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('leaves a list that already fits alone', () => {
    expect(batched([1, 2], 5)).toEqual([[1, 2]])
  })

  it('sends nothing for nothing', () => {
    expect(batched([], 5)).toEqual([])
  })

  it('keeps a full account clear-out to short requests', () => {
    const ids = Array.from({ length: 500 }, (_, index) => `id-${index}`)
    const batches = batched(ids, DELETE_KEYS)

    expect(batches).toHaveLength(5)
    expect(batches.every((batch) => batch.length <= DELETE_KEYS)).toBe(true)
    expect(batches.flat()).toEqual(ids)
  })
})
