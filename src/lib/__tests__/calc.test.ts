import { describe, expect, it } from 'vitest'
import {
  actualExpenses,
  budgetGroups,
  categoryTotals,
  knownMonths,
  monthlyTrend,
  plannedExpenses,
  runningBalance,
  sortTransactions,
  summarise,
} from '../calc'
import { sheetCategories, sheetPlan } from './fixtures'
import { formatAZN, formatSignedAZN, parseAmount, round2, sum } from '../money'
import { isValidDate, monthOf, shiftMonth } from '../dates'
import { migrateIncomePlan, plannedIncomeOf } from '../types'
import type { FinanceData, Transaction } from '../types'

const M = '2025-10'

function build(partial: Partial<FinanceData> = {}): FinanceData {
  return {
    transactions: [],
    budgetLines: [],
    incomePlans: [],
    categories: sheetCategories(),
    savingsPots: [],
    savingsEntries: [],
    savingsPlans: [],
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

/* ------------------------------------------------------------------ *
 * Fidelity to the spreadsheet
 * ------------------------------------------------------------------ */

describe('spreadsheet fidelity', () => {
  it('reproduces F11: planned expenses total 1,142.00 ₼', () => {
    const data = build({ budgetLines: sheetPlan(M) })
    expect(plannedExpenses(data.budgetLines, M)).toBe(1142)
  })

  it('reproduces the full BÜDCƏ İCMALI block with no actuals recorded', () => {
    // C11 = 990, C12 = 0, column E empty — exactly the state of the sheet.
    const data = build({
      budgetLines: sheetPlan(M),
      incomePlans: [{ month: M, amounts: { 'Maaş': 990 } }],
    })
    const summary = summarise(data, M)

    expect(summary.plannedIncome).toBe(990) // C13
    expect(summary.actualIncome).toBe(0) // D13
    expect(summary.plannedExpenses).toBe(1142) // F11
    expect(summary.actualExpenses).toBe(0) // G11
    expect(summary.plannedRemainder).toBe(-152) // D4 = C13 - F11
    expect(summary.actualRemainder).toBe(0) // D5
    expect(summary.difference).toBe(152) // D6 = D5 - D4
  })

  it('keeps D5 = actual income − actual expenses', () => {
    const data = build({
      transactions: [
        tx({ type: 'income', category: 'Maaş', amount: 990 }),
        tx({ amount: 230 }),
        tx({ amount: 100.55 }),
      ],
      incomePlans: [{ month: M, amounts: { 'Maaş': 990 } }],
      budgetLines: sheetPlan(M),
    })
    const summary = summarise(data, M)
    expect(summary.actualIncome).toBe(990)
    expect(summary.actualExpenses).toBe(330.55)
    expect(summary.actualRemainder).toBe(659.45)
    expect(summary.difference).toBe(round2(659.45 - -152))
  })

  it('reproduces the variance column F = D − E per category', () => {
    const data = build({
      budgetLines: [
        { id: 'b1', month: M, description: 'Ev kirəsi', category: 'Əlavə xərclər', planned: 230 },
      ],
      transactions: [tx({ category: 'Əlavə xərclər', amount: 250 })],
    })
    const [group] = budgetGroups(data, M)
    expect(group.actual).toBe(250)
    expect(group.variance).toBe(-20) // over budget
  })

  it('reproduces the Əlavə məlumatlar SUMIF rollup per category', () => {
    const data = build({
      budgetLines: sheetPlan(M),
      transactions: [
        tx({ category: 'Kreditlər', amount: 220 }),
        tx({ category: 'Kreditlər', amount: 35 }),
        tx({ category: 'Ərzaq', amount: 60 }),
      ],
    })
    const totals = categoryTotals(data, M)
    const credits = totals.find((entry) => entry.category === 'Kreditlər')!
    const food = totals.find((entry) => entry.category === 'Ərzaq')!

    expect(credits.actual).toBe(255) // SUMIF
    expect(credits.planned).toBe(555) // 220 + 35 + 0 + 300
    expect(food.actual).toBe(60)
    expect(round2(credits.share + food.share)).toBe(1)
  })

  it('reports actual spend per category, never invented per line', () => {
    const data = build({
      budgetLines: sheetPlan(M),
      transactions: [tx({ category: 'Kreditlər', amount: 100 })],
    })
    const groups = budgetGroups(data, M)
    const credits = groups.find((group) => group.category === 'Kreditlər')!
    expect(credits.actual).toBe(100)
    expect(credits.lines).toHaveLength(4)
    // Group actuals always reconcile with the month total.
    expect(sum(groups.map((group) => group.actual))).toBe(
      actualExpenses(data.transactions, M),
    )
  })

  it('shows a category that was spent on but never planned', () => {
    const data = build({
      budgetLines: [
        { id: 'b1', month: M, description: 'Saç', category: 'Şəxsi gigiyena', planned: 20 },
      ],
      transactions: [tx({ category: 'Əyləncə', amount: 18.4 })],
    })
    const unplanned = budgetGroups(data, M).find((g) => g.category === 'Əyləncə')!
    expect(unplanned.lines).toEqual([])
    expect(unplanned.planned).toBe(0)
    expect(unplanned.actual).toBe(18.4)
    expect(unplanned.variance).toBe(-18.4)
  })
})

/* ------------------------------------------------------------------ *
 * Edge cases
 * ------------------------------------------------------------------ */

describe('edge cases', () => {
  it('handles no transactions at all', () => {
    const summary = summarise(build(), M)
    expect(summary).toMatchObject({
      plannedIncome: 0,
      actualIncome: 0,
      plannedExpenses: 0,
      actualExpenses: 0,
      plannedRemainder: 0,
      actualRemainder: 0,
      difference: 0,
    })
    expect(runningBalance([])).toBe(0)
    expect(categoryTotals(build(), M)).toEqual([])
  })

  it('handles income only', () => {
    const data = build({ transactions: [tx({ type: 'income', category: 'Maaş', amount: 990 })] })
    expect(summarise(data, M).actualRemainder).toBe(990)
    expect(categoryTotals(data, M)).toEqual([]) // income is not an expense category
  })

  it('handles expenses only, producing a negative remainder', () => {
    const data = build({ transactions: [tx({ amount: 300 })] })
    expect(summarise(data, M).actualRemainder).toBe(-300)
    expect(runningBalance(data.transactions)).toBe(-300)
  })

  it('handles several transactions on the same date', () => {
    const data = build({
      transactions: [
        tx({ date: `${M}-07`, amount: 10 }),
        tx({ date: `${M}-07`, amount: 20 }),
        tx({ date: `${M}-07`, amount: 30 }),
      ],
    })
    expect(actualExpenses(data.transactions, M)).toBe(60)
    expect(sortTransactions(data.transactions)).toHaveLength(3)
  })

  it('handles large amounts without precision loss', () => {
    const data = build({
      transactions: [
        tx({ type: 'income', category: 'Maaş', amount: 9_999_999.99 }),
        tx({ amount: 0.01 }),
      ],
    })
    expect(summarise(data, M).actualRemainder).toBe(9_999_999.98)
  })

  it('handles repeated decimal amounts without float drift', () => {
    const data = build({
      transactions: Array.from({ length: 10 }, () => tx({ amount: 0.1 })),
    })
    expect(actualExpenses(data.transactions, M)).toBe(1)
  })

  it('returns zero for a month with no transactions but keeps the plan visible', () => {
    const data = build({ budgetLines: sheetPlan(M) })
    const summary = summarise(data, '2025-11')
    expect(summary.plannedExpenses).toBe(0)
    expect(summary.actualExpenses).toBe(0)
  })

  it('omits categories that have neither plan nor spend', () => {
    const data = build({
      budgetLines: [
        { id: 'b1', month: M, description: 'Saç', category: 'Şəxsi gigiyena', planned: 20 },
      ],
    })
    const totals = categoryTotals(data, M)
    expect(totals).toHaveLength(1)
    expect(totals[0]).toMatchObject({ planned: 20, actual: 0, share: 0 })
  })

  it('keeps a planned line with a zero amount and no divide-by-zero', () => {
    const data = build({
      budgetLines: [
        { id: 'b1', month: M, description: 'Nağd kredit kartı', category: 'Kreditlər', planned: 0 },
      ],
    })
    const [group] = budgetGroups(data, M)
    expect(group.planned).toBe(0)
    expect(group.actual).toBe(0)
    expect(group.variance).toBe(0)
  })

  it('excludes other months from a month summary', () => {
    const data = build({
      transactions: [tx({ date: '2025-09-30', amount: 500 }), tx({ date: '2025-10-01', amount: 20 })],
    })
    expect(actualExpenses(data.transactions, M)).toBe(20)
    expect(actualExpenses(data.transactions, '2025-09')).toBe(500)
  })

  it('accumulates the running balance across months, up to the viewed month', () => {
    const data = build({
      transactions: [
        tx({ date: '2025-09-01', type: 'income', category: 'Maaş', amount: 1000 }),
        tx({ date: '2025-09-15', amount: 400 }),
        tx({ date: '2025-10-15', amount: 100 }),
        tx({ date: '2025-11-15', amount: 999 }),
      ],
    })
    expect(runningBalance(data.transactions, '2025-09')).toBe(600)
    expect(runningBalance(data.transactions, '2025-10')).toBe(500)
    expect(runningBalance(data.transactions)).toBe(-499)
  })

  it('reports empty months in the trend as zeroes rather than gaps', () => {
    const data = build({ transactions: [tx({ date: '2025-10-02', amount: 50 })] })
    const trend = monthlyTrend(data, ['2025-09', '2025-10', '2025-11'])
    expect(trend.map((point) => point.remainder)).toEqual([0, -50, 0])
  })
})

/* ------------------------------------------------------------------ *
 * Editing and deleting recompute everything
 * ------------------------------------------------------------------ */

describe('editing and deleting', () => {
  const base = build({
    incomePlans: [{ month: M, amounts: { 'Maaş': 990 } }],
    budgetLines: sheetPlan(M),
    transactions: [
      { id: 'a', date: `${M}-01`, type: 'income', category: 'Maaş', description: 'Salary', amount: 990 },
      { id: 'b', date: `${M}-03`, type: 'expense', category: 'Əlavə xərclər', description: 'Rent', amount: 230 },
    ],
  })

  it('recomputes after an edit', () => {
    const edited = {
      ...base,
      transactions: base.transactions.map((t) => (t.id === 'b' ? { ...t, amount: 300 } : t)),
    }
    expect(summarise(edited, M).actualExpenses).toBe(300)
    expect(summarise(edited, M).actualRemainder).toBe(690)
  })

  it('recomputes after a delete', () => {
    const deleted = { ...base, transactions: base.transactions.filter((t) => t.id !== 'b') }
    expect(summarise(deleted, M).actualExpenses).toBe(0)
    expect(summarise(deleted, M).actualRemainder).toBe(990)
    expect(categoryTotals(deleted, M).find((c) => c.category === 'Əlavə xərclər')!.actual).toBe(0)
  })

  it('moves the money when a transaction is edited into another month', () => {
    const moved = {
      ...base,
      transactions: base.transactions.map((t) =>
        t.id === 'b' ? { ...t, date: '2025-11-03' } : t,
      ),
    }
    expect(summarise(moved, M).actualExpenses).toBe(0)
    expect(summarise(moved, '2025-11').actualExpenses).toBe(230)
  })
})

/* ------------------------------------------------------------------ *
 * Money and dates
 * ------------------------------------------------------------------ */

describe('money', () => {
  it('formats AZN the way the sheet does', () => {
    expect(formatAZN(1250)).toBe('1,250.00 ₼')
    expect(formatAZN(0)).toBe('0.00 ₼')
    expect(formatAZN(-152)).toBe('-152.00 ₼')
    expect(formatAZN(1234567.891)).toBe('1,234,567.89 ₼')
  })

  it('never renders negative zero', () => {
    expect(formatAZN(-0)).toBe('0.00 ₼')
    expect(formatAZN(-0.001)).toBe('0.00 ₼')
  })

  it('signs positive values explicitly', () => {
    expect(formatSignedAZN(152)).toBe('+152.00 ₼')
    expect(formatSignedAZN(-152)).toBe('-152.00 ₼')
    expect(formatSignedAZN(0)).toBe('0.00 ₼')
  })

  it('parses the amount formats a person actually types', () => {
    expect(parseAmount('12')).toBe(12)
    expect(parseAmount('12.5')).toBe(12.5)
    expect(parseAmount('12,50')).toBe(12.5)
    expect(parseAmount('1,234.56')).toBe(1234.56)
    expect(parseAmount('1 234,56')).toBe(1234.56)
    expect(parseAmount('  90 ₼ ')).toBe(90)
  })

  it('rejects input that is not a number', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('.')).toBeNull()
    expect(parseAmount('1.2.3')).toBeNull()
  })

  it('rounds half away from zero at two decimals', () => {
    expect(round2(0.005)).toBe(0.01)
    expect(round2(-0.005)).toBe(-0.01)
    expect(round2(2.675)).toBe(2.68)
    expect(sum([0.1, 0.2])).toBe(0.3)
  })
})

describe('dates', () => {
  it('rejects impossible calendar dates', () => {
    expect(isValidDate('2025-02-30')).toBe(false)
    expect(isValidDate('2025-13-01')).toBe(false)
    expect(isValidDate('2025-00-10')).toBe(false)
    expect(isValidDate('not-a-date')).toBe(false)
    expect(isValidDate('2025-2-3')).toBe(false)
  })

  it('accepts real dates including leap days', () => {
    expect(isValidDate('2024-02-29')).toBe(true)
    expect(isValidDate('2025-10-31')).toBe(true)
  })

  it('shifts months across year boundaries', () => {
    expect(shiftMonth('2025-01', -1)).toBe('2024-12')
    expect(shiftMonth('2025-12', 1)).toBe('2026-01')
    expect(shiftMonth('2025-10', -12)).toBe('2024-10')
  })

  it('derives the month from a date', () => {
    expect(monthOf('2025-10-14')).toBe('2025-10')
  })
})

/* ------------------------------------------------------------------ *
 * Month navigation
 * ------------------------------------------------------------------ */

describe('month options', () => {
  it('always includes the month being viewed', () => {
    const data = build({ transactions: [tx({ date: '2026-08-05' })] })
    const months = knownMonths(data, '2026-08')
    // A month with no data of its own must still be reachable and selectable.
    const viewing = '2026-09'
    const options = [
      ...new Set([viewing, ...months, shiftMonth(viewing, -1), shiftMonth(viewing, 1)]),
    ]
    expect(options).toContain(viewing)
  })

  it('lists every month that holds data, newest first', () => {
    const data = build({
      transactions: [tx({ date: '2026-06-01' }), tx({ date: '2026-08-01' })],
      budgetLines: [
        { id: 'b', month: '2026-07', description: 'x', category: 'Ərzaq', planned: 5 },
      ],
    })
    expect(knownMonths(data, '2026-08')).toEqual(['2026-08', '2026-07', '2026-06'])
  })
})

/* ------------------------------------------------------------------ *
 * Reading an income plan saved in the older shape
 * ------------------------------------------------------------------ */

describe('migrateIncomePlan', () => {
  it('moves salary and additional onto the two seeded categories', () => {
    expect(migrateIncomePlan({ month: M, salary: 990, additional: 50 })).toEqual({
      month: M,
      amounts: { 'Maaş': 990, 'Əlavə gəlir': 50 },
    })
  })

  it('does not invent a figure for a field that was zero', () => {
    expect(migrateIncomePlan({ month: M, salary: 990, additional: 0 })).toEqual({
      month: M,
      amounts: { 'Maaş': 990 },
    })
  })

  it('leaves a plan already in the current shape alone', () => {
    const plan = { month: M, amounts: { Mentorluq: 300 } }
    expect(migrateIncomePlan(plan)).toEqual(plan)
  })

  it('prefers the current shape when a row carries both', () => {
    expect(
      migrateIncomePlan({ month: M, amounts: { Mentorluq: 300 }, salary: 990 }),
    ).toEqual({ month: M, amounts: { Mentorluq: 300 } })
  })

  it('brings a pre-translation category name forward with it', () => {
    expect(migrateIncomePlan({ month: M, amounts: { 'Зарплата': 990 } })).toEqual({
      month: M,
      amounts: { 'Maaş': 990 },
    })
  })

  it('totals whatever it holds, regardless of how many categories', () => {
    expect(plannedIncomeOf({ month: M, amounts: { a: 100, b: 250, c: 5 } })).toBe(355)
    expect(plannedIncomeOf({ month: M, amounts: {} })).toBe(0)
    expect(plannedIncomeOf(undefined)).toBe(0)
  })
})
