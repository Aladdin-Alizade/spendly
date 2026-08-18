import { describe, expect, it } from 'vitest'
import { hasErrors, validateTransaction } from '../validate'
import type { TransactionInput } from '../validate'
import { categoryNames } from '../categories'
import { emptyData } from '../storage'
import { defaultCategories } from '../types'

const data = { ...emptyData, categories: defaultCategories() }
const EXPENSES = categoryNames(data, 'expense')
const INCOMES = categoryNames(data, 'income')

/** The caller passes the list for the type it is editing; these tests do the
 *  same, so they exercise the contract the dialog actually uses. */
function check(input: TransactionInput, allowed = EXPENSES) {
  return validateTransaction(input, allowed)
}

const valid: TransactionInput = {
  date: '2025-10-14',
  type: 'expense',
  category: 'Ərzaq',
  description: 'Ərzaq alışı',
  amount: '45.20',
  note: '',
}

describe('transaction validation', () => {
  it('accepts a well-formed transaction', () => {
    expect(hasErrors(check(valid))).toBe(false)
  })

  it('rejects an empty transaction', () => {
    const errors = check({
      date: '',
      type: 'expense',
      category: '',
      description: '',
      amount: '',
      note: '',
    })
    expect(Object.keys(errors).sort()).toEqual([
      'amount',
      'category',
      'date',
      'description',
    ])
  })

  it('rejects zero and negative amounts', () => {
    expect(check({ ...valid, amount: '0' }).amount).toBeDefined()
    expect(check({ ...valid, amount: '-5' }).amount).toBeDefined()
  })

  it('rejects an absurdly large amount', () => {
    expect(check({ ...valid, amount: '999999999' }).amount).toBeDefined()
  })

  it('rejects a whitespace-only description', () => {
    expect(check({ ...valid, description: '   ' }).description).toBeDefined()
  })

  it('rejects an impossible date', () => {
    expect(check({ ...valid, date: '2025-02-30' }).date).toBeDefined()
  })

  it('rejects an expense category on an income transaction', () => {
    const income = { ...valid, type: 'income' as const }
    expect(check({ ...income, category: 'Ərzaq' }, INCOMES).category).toBeDefined()
    expect(check({ ...income, category: 'Maaş' }, INCOMES).category).toBeUndefined()
  })

  it('accepts a category the user has just created', () => {
    const category = 'Ev heyvanları'
    expect(check({ ...valid, category }).category).toBeDefined()
    expect(check({ ...valid, category }, [...EXPENSES, category]).category).toBeUndefined()
  })

  it('rejects a category that has been removed since', () => {
    const remaining = EXPENSES.filter((name) => name !== 'Ərzaq')
    expect(check(valid, remaining).category).toBeDefined()
  })
})
