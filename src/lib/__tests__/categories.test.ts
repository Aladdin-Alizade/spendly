import { describe, expect, it } from 'vitest'
import {
  addCategory,
  categoriesFromData,
  categoriesOfType,
  categoryNames,
  categoryUsage,
  isCategoryInUse,
  removeCategory,
  renameCategory,
  validateCategoryName,
} from '../categories'
import { sum } from '../money'
import type { FinanceData, Transaction } from '../types'

const M = '2026-08'

function build(partial: Partial<FinanceData> = {}): FinanceData {
  return {
    transactions: [],
    budgetLines: [],
    incomePlans: [],
    categories: [
      { id: 'c1', name: 'Ərzaq', type: 'expense' },
      { id: 'c2', name: 'Nəqliyyat', type: 'expense' },
      { id: 'c3', name: 'Maaş', type: 'income' },
    ],
    ...partial,
  }
}

let counter = 0
function tx(over: Partial<Transaction> = {}): Transaction {
  counter += 1
  return {
    id: `t${counter}`,
    date: `${M}-05`,
    type: 'expense',
    category: 'Ərzaq',
    description: 'Test',
    amount: 10,
    ...over,
  }
}

/* ------------------------------------------------------------------ */

describe('reading the category list', () => {
  it('separates the two sides of the ledger', () => {
    const data = build()
    expect(categoryNames(data, 'expense')).toEqual(['Ərzaq', 'Nəqliyyat'])
    expect(categoryNames(data, 'income')).toEqual(['Maaş'])
    expect(categoriesOfType(data, 'income')).toHaveLength(1)
  })

  it('counts what depends on a category', () => {
    const data = build({
      transactions: [tx(), tx(), tx({ category: 'Nəqliyyat' })],
      budgetLines: [
        { id: 'b1', month: M, description: 'p', category: 'Ərzaq', planned: 100 },
      ],
    })

    expect(categoryUsage(data, 'Ərzaq')).toEqual({
      transactions: 2,
      budgetLines: 1,
      incomePlans: 0,
    })
    expect(isCategoryInUse(categoryUsage(data, 'Ərzaq'))).toBe(true)
    expect(isCategoryInUse(categoryUsage(data, 'Maaş'))).toBe(false)
  })
})

describe('validateCategoryName', () => {
  const data = build()

  it('requires a name', () => {
    expect(validateCategoryName(data, '   ', 'expense')).not.toBeNull()
  })

  it('rejects a duplicate within the same type, whatever its case', () => {
    expect(validateCategoryName(data, 'ərzaq', 'expense')).not.toBeNull()
    expect(validateCategoryName(data, '  Ərzaq  ', 'expense')).not.toBeNull()
  })

  it('allows the same name on the other side of the ledger', () => {
    expect(validateCategoryName(data, 'Ərzaq', 'income')).toBeNull()
  })

  it('does not let a category clash with itself while being edited', () => {
    expect(validateCategoryName(data, 'Ərzaq', 'expense', 'c1')).toBeNull()
  })

  it('accepts a new name', () => {
    expect(validateCategoryName(data, 'Ev heyvanları', 'expense')).toBeNull()
  })
})

describe('addCategory', () => {
  it('appends the category, trimmed', () => {
    const data = addCategory(build(), { id: 'c9', name: '  Ev  ', type: 'expense' })
    expect(categoryNames(data, 'expense')).toEqual(['Ərzaq', 'Nəqliyyat', 'Ev'])
  })
})

describe('renameCategory', () => {
  const data = build({
    transactions: [
      tx({ amount: 10 }),
      tx({ category: 'Nəqliyyat', amount: 20 }),
      tx({ type: 'income', category: 'Maaş', amount: 900 }),
    ],
    budgetLines: [
      { id: 'b1', month: M, description: 'p', category: 'Ərzaq', planned: 100 },
      { id: 'b2', month: M, description: 'q', category: 'Nəqliyyat', planned: 50 },
    ],
  })

  it('carries every transaction and budget line across with it', () => {
    const next = renameCategory(data, 'c1', 'Yemək')

    expect(categoryNames(next, 'expense')).toEqual(['Yemək', 'Nəqliyyat'])
    expect(categoryUsage(next, 'Yemək')).toEqual({
      transactions: 1,
      budgetLines: 1,
      incomePlans: 0,
    })
    expect(categoryUsage(next, 'Ərzaq')).toEqual({
      transactions: 0,
      budgetLines: 0,
      incomePlans: 0,
    })
  })

  it('leaves every amount alone', () => {
    const next = renameCategory(data, 'c1', 'Yemək')
    expect(sum(next.transactions.map((item) => item.amount))).toBe(
      sum(data.transactions.map((item) => item.amount)),
    )
    expect(next.transactions).toHaveLength(data.transactions.length)
  })

  it('does not touch the other side of the ledger, or other categories', () => {
    const next = renameCategory(data, 'c1', 'Yemək')
    expect(categoryUsage(next, 'Nəqliyyat')).toEqual({
      transactions: 1,
      budgetLines: 1,
      incomePlans: 0,
    })
    expect(categoryUsage(next, 'Maaş')).toEqual({
      transactions: 1,
      budgetLines: 0,
      incomePlans: 0,
    })
  })

  it('renames an income category without disturbing a same-named expense one', () => {
    const shared = build({
      categories: [
        { id: 'c1', name: 'Bonus', type: 'expense' },
        { id: 'c2', name: 'Bonus', type: 'income' },
      ],
      transactions: [
        tx({ category: 'Bonus' }),
        tx({ type: 'income', category: 'Bonus' }),
      ],
    })

    const next = renameCategory(shared, 'c2', 'Mükafat')
    expect(next.transactions.map((item) => item.category)).toEqual(['Bonus', 'Mükafat'])
  })

  it('ignores an empty name, an unchanged name and an unknown id', () => {
    expect(renameCategory(data, 'c1', '   ')).toBe(data)
    expect(renameCategory(data, 'c1', 'Ərzaq')).toBe(data)
    expect(renameCategory(data, 'nope', 'Yemək')).toBe(data)
  })
})

describe('removeCategory', () => {
  const unused = build()
  const used = build({
    transactions: [tx(), tx({ amount: 5 })],
    budgetLines: [
      { id: 'b1', month: M, description: 'p', category: 'Ərzaq', planned: 100 },
    ],
  })

  it('drops a category nothing uses', () => {
    const next = removeCategory(unused, 'c1')
    expect(categoryNames(next, 'expense')).toEqual(['Nəqliyyat'])
  })

  it('refuses to strand history: a used category with nowhere to go stays', () => {
    expect(removeCategory(used, 'c1')).toBe(used)
  })

  it('moves the history over when given a destination', () => {
    const next = removeCategory(used, 'c1', 'Nəqliyyat')

    expect(categoryNames(next, 'expense')).toEqual(['Nəqliyyat'])
    expect(categoryUsage(next, 'Nəqliyyat')).toEqual({
      transactions: 2,
      budgetLines: 1,
      incomePlans: 0,
    })
    // Nothing was deleted along with the category.
    expect(next.transactions).toHaveLength(2)
    expect(sum(next.transactions.map((item) => item.amount))).toBe(15)
  })

  it('ignores an unknown id', () => {
    expect(removeCategory(used, 'nope')).toBe(used)
  })
})

/* ------------------------------------------------------------------ *
 * Income categories carry their planned figures
 * ------------------------------------------------------------------ */

describe('income categories and the planned-income figures', () => {
  const planned = build({
    categories: [
      { id: 'i1', name: 'Maaş', type: 'income' },
      { id: 'i2', name: 'Mentorluq', type: 'income' },
      { id: 'c1', name: 'Ərzaq', type: 'expense' },
    ],
    incomePlans: [
      { month: M, amounts: { 'Maaş': 990, Mentorluq: 200 } },
      { month: '2026-07', amounts: { 'Maaş': 900 } },
    ],
  })

  it('counts a planned figure as usage, even with no transactions yet', () => {
    expect(categoryUsage(planned, 'Mentorluq')).toEqual({
      transactions: 0,
      budgetLines: 0,
      incomePlans: 1,
    })
    expect(isCategoryInUse(categoryUsage(planned, 'Mentorluq'))).toBe(true)
  })

  it('carries the planned figure across a rename, in every month', () => {
    const next = renameCategory(planned, 'i1', 'Əsas iş')

    expect(next.incomePlans[0].amounts).toEqual({ 'Əsas iş': 990, Mentorluq: 200 })
    expect(next.incomePlans[1].amounts).toEqual({ 'Əsas iş': 900 })
  })

  it('will not silently drop a planned figure on delete', () => {
    expect(removeCategory(planned, 'i2')).toBe(planned)
  })

  it('moves the planned figure to the destination on delete, adding to it', () => {
    const next = removeCategory(planned, 'i2', 'Maaş')

    expect(next.incomePlans[0].amounts).toEqual({ 'Maaş': 1190 })
    expect(next.categories.some((category) => category.name === 'Mentorluq')).toBe(false)
  })

  it('leaves expense renames out of the income plan entirely', () => {
    const next = renameCategory(planned, 'c1', 'Yemək')
    expect(next.incomePlans).toEqual(planned.incomePlans)
  })
})

/* ------------------------------------------------------------------ *
 * Categories implied by the data itself
 * ------------------------------------------------------------------ */

describe('categoriesFromData', () => {
  it('gives a new account nothing, because it has nothing', () => {
    expect(categoriesFromData(build({ categories: [] }))).toEqual([])
  })

  it('reads the categories a stored history already names', () => {
    const data = build({
      categories: [],
      transactions: [
        tx({ category: 'Ərzaq' }),
        tx({ category: 'Nəqliyyat' }),
        tx({ type: 'income', category: 'Maaş' }),
      ],
    })

    expect(categoriesFromData(data)).toEqual([
      { id: 'expense-0', name: 'Ərzaq', type: 'expense' },
      { id: 'expense-1', name: 'Nəqliyyat', type: 'expense' },
      { id: 'income-0', name: 'Maaş', type: 'income' },
    ])
  })

  it('files a budget line under expenses and a planned figure under income', () => {
    const data = build({
      categories: [],
      budgetLines: [
        { id: 'b1', month: M, description: 'Ev', category: 'Kirayə', planned: 230 },
      ],
      incomePlans: [{ month: M, amounts: { Mentorluq: 200 } }],
    })

    expect(categoriesFromData(data)).toEqual([
      { id: 'expense-0', name: 'Kirayə', type: 'expense' },
      { id: 'income-0', name: 'Mentorluq', type: 'income' },
    ])
  })

  it('names a category once, however many rows use it', () => {
    const data = build({
      categories: [],
      transactions: [tx({ category: 'Ərzaq' }), tx({ category: ' ərzaq ' })],
    })

    expect(categoriesFromData(data)).toHaveLength(1)
  })

  it('keeps the same name on both sides of the ledger apart', () => {
    const data = build({
      categories: [],
      transactions: [
        tx({ category: 'Bonus' }),
        tx({ type: 'income', category: 'Bonus' }),
      ],
    })

    expect(categoriesFromData(data).map((category) => category.type)).toEqual([
      'expense',
      'income',
    ])
  })
})
