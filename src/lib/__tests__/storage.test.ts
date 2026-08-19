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
