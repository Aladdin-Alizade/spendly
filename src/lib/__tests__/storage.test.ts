/**
 * What an account holds before anybody has typed anything.
 *
 * The app used to hand a new account one household's categories and one
 * household's monthly plan. Those are somebody's own answers, so a first run
 * now starts empty and everything in it is written by its owner.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalStorageRepository, emptyData, normaliseData } from '../storage'
import type { FinanceData } from '../types'
import { readSnapshot, syncedKey, workingKey, writeSnapshot } from '../syncingRepository'

const KEY = 'spendly.data.v1'

class MemoryStorage {
  private items = new Map<string, string>()
  getItem = (key: string) => this.items.get(key) ?? null
  setItem = (key: string, value: string) => void this.items.set(key, value)
  removeItem = (key: string) => void this.items.delete(key)
  clear = () => this.items.clear()
  key = (index: number) => [...this.items.keys()][index] ?? null
  get length() {
    return this.items.size
  }
}

let store: MemoryStorage

beforeEach(() => {
  store = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    value: store,
    configurable: true,
  })
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage')
})

describe('a first run', () => {
  it('opens an empty account', async () => {
    await expect(new LocalStorageRepository().load()).resolves.toEqual(emptyData)
  })

  it('writes nothing, so nothing is there to sync away', async () => {
    await new LocalStorageRepository().load()
    expect(store.getItem(KEY)).toBeNull()
  })
})

describe('reading a stored snapshot', () => {
  it('leaves an emptied category list empty', () => {
    const stored: FinanceData = { ...emptyData, categories: [] }
    expect(normaliseData(stored).categories).toEqual([])
  })

  it('recovers the categories of a snapshot saved before they were stored', () => {
    // Written when the category list was a hard-coded constant, so the rows
    // name their categories but no list came with them.
    const legacy = {
      transactions: [
        {
          id: 't1',
          date: '2026-08-05',
          type: 'expense',
          category: 'Ərzaq',
          description: 'Bazarlıq',
          amount: 40,
        },
      ],
      budgetLines: [],
      incomePlans: [{ month: '2026-08', salary: 990, additional: 0 }],
    }

    expect(normaliseData(legacy).categories).toEqual([
      { id: 'expense-0', name: 'Ərzaq', type: 'expense' },
      { id: 'income-0', name: 'Maaş', type: 'income' },
    ])
  })

  it('keeps a stored list exactly as it is', () => {
    const stored: FinanceData = {
      ...emptyData,
      categories: [{ id: 'c1', name: 'Kirayə', type: 'expense' }],
    }
    expect(normaliseData(stored).categories).toEqual(stored.categories)
  })
})

/**
 * Storage that will not take the change.
 *
 * A full quota used to be swallowed: the write failed, nothing was said, and
 * the banner underneath went on promising the edit had been kept here. That
 * was the one sentence in the app that was not true, said at the moment it
 * mattered most.
 */
describe('storage that refuses the write', () => {
  const full = () => {
    store.setItem = () => {
      throw new DOMException('QuotaExceededError')
    }
  }

  it('says so rather than reporting a save that did not happen', () => {
    full()
    expect(writeSnapshot(workingKey('u1'), emptyData)).toBe(false)
  })

  it('rejects in local-only mode, where there is no server to fall back on', async () => {
    full()
    await expect(new LocalStorageRepository().save(emptyData)).rejects.toThrow(
      /yaddaşı doludur/,
    )
  })

  it('reads back what it did manage to write', () => {
    expect(writeSnapshot(workingKey('u1'), emptyData)).toBe(true)
    expect(readSnapshot(workingKey('u1'))).toEqual(emptyData)
  })
})

/**
 * Reading a snapshot that is not quite right.
 *
 * One row an older build wrote differently must not cost the person every
 * other row they entered offline.
 */
describe('a damaged snapshot', () => {
  it('keeps the rows it can read when one of them is broken', () => {
    const stored = {
      transactions: [
        {
          id: 't1',
          date: '2026-08-05',
          type: 'expense',
          category: 'Ərzaq',
          description: 'Bazarlıq',
          amount: 40,
        },
        {
          id: 't3',
          date: '2026-08-06',
          type: 'expense',
          category: 'Ərzaq',
          description: 'Çörək',
          amount: 5,
        },
      ],
      savingsPots: [{ id: 'p1', name: 'Ehtiyat fondu' }],
      // Written by something that thought this was an object.
      savingsEntries: { broken: true },
    }

    const read = normaliseData(stored)
    expect(read.transactions.map((t) => t.id)).toEqual(['t1', 't3'])
    expect(read.savingsPots).toHaveLength(1)
    expect(read.savingsEntries).toEqual([])
  })

  it('reads nothing at all as an empty account rather than a crash', () => {
    expect(normaliseData(null)).toEqual(emptyData)
    expect(normaliseData('not a snapshot')).toEqual(emptyData)
  })
})

/**
 * Which key a snapshot goes in.
 *
 * This used to be one key per browser, which meant it was shared by every
 * account that ever signed in there — and the sync treats whatever the key
 * holds as work this browser has not sent yet. So signing in handed the
 * previous occupant's rows to the new account and uploaded them as its own.
 */
describe('snapshot scope', () => {
  it('does not let two accounts share one browser key', () => {
    const one = workingKey('11111111-1111-1111-1111-111111111111')
    const two = workingKey('22222222-2222-2222-2222-222222222222')

    expect(one).not.toBe(two)
    expect(one).not.toBe(workingKey(null))
    expect(syncedKey('11111111-1111-1111-1111-111111111111')).not.toBe(one)
  })

  it('keeps the plain keys when there is no account to scope to', () => {
    // Local-storage mode has nobody to scope to, and a browser that has never
    // signed in has to keep writing where it already writes.
    expect(workingKey(null)).toBe('spendly.data.v1')
    expect(workingKey(undefined)).toBe('spendly.data.v1')
    expect(syncedKey(null)).toBe('spendly.synced.v1')
  })
})
