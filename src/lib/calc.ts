/**
 * Every financial number in the app is derived here. Nothing is stored
 * pre-computed, and nothing is hard-coded.
 *
 * Each function names the spreadsheet cell it reproduces.
 */

import { round2, sum } from './money'
import { monthOf } from './dates'
import { EXPENSE_CATEGORIES, plannedIncomeOf } from './types'
import type {
  BudgetLine,
  ExpenseCategory,
  FinanceData,
  MonthKey,
  Transaction,
} from './types'

export interface MonthSummary {
  month: MonthKey
  /** 'BÜDCƏ İCMALI'!C13 — SUM(C11:C12) */
  plannedIncome: number
  /** 'BÜDCƏ İCMALI'!D13 — SUM(D11:D12) */
  actualIncome: number
  /** 'BÜDCƏ İCMALI'!F11 — SUM('Aylıq rasxod'!D:D) */
  plannedExpenses: number
  /** 'BÜDCƏ İCMALI'!G11 — SUM('Aylıq rasxod'!E:E) */
  actualExpenses: number
  /** 'BÜDCƏ İCMALI'!D4 — C13 - F11 */
  plannedRemainder: number
  /** 'BÜDCƏ İCMALI'!D5 — Фактические_Доходы - Фактические_расходы */
  actualRemainder: number
  /** 'BÜDCƏ İCMALI'!D6 — D5 - D4 */
  difference: number
}

/**
 * Planned lines of one category, with the actual spend for that category.
 *
 * Actual is reported per category rather than per line: a transaction records
 * a category, so line-level actuals do not exist and would have to be invented.
 */
export interface BudgetGroup {
  category: ExpenseCategory
  lines: BudgetLine[]
  /** Sum of the group's planned amounts. */
  planned: number
  /** SUMIF over actual spend for this category. */
  actual: number
  /** Column F — planned - actual. Positive means under budget. */
  variance: number
}

/** One row of the 'Əlavə məlumatlar' SUMIF rollup. */
export interface CategoryTotal {
  category: ExpenseCategory
  planned: number
  actual: number
  /** Share of actual expenses, 0..1. Zero when there is no spending at all. */
  share: number
}

const byMonth = <T extends { month: MonthKey }>(items: T[], month: MonthKey) =>
  items.filter((item) => item.month === month)

export function transactionsInMonth(
  transactions: Transaction[],
  month: MonthKey,
): Transaction[] {
  return transactions.filter((transaction) => monthOf(transaction.date) === month)
}

/** Newest first; ties on the same date resolve to most recently added first. */
export function sortTransactions(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return a.id < b.id ? 1 : -1
  })
}

export function budgetLinesInMonth(
  budgetLines: BudgetLine[],
  month: MonthKey,
): BudgetLine[] {
  return byMonth(budgetLines, month)
}

/** 'BÜDCƏ İCMALI'!D13 — actual income is the sum of income transactions. */
export function actualIncome(transactions: Transaction[], month: MonthKey): number {
  return sum(
    transactionsInMonth(transactions, month)
      .filter((transaction) => transaction.type === 'income')
      .map((transaction) => transaction.amount),
  )
}

/** 'BÜDCƏ İCMALI'!G11 — actual expenses are the sum of expense transactions. */
export function actualExpenses(transactions: Transaction[], month: MonthKey): number {
  return sum(
    transactionsInMonth(transactions, month)
      .filter((transaction) => transaction.type === 'expense')
      .map((transaction) => transaction.amount),
  )
}

/** 'BÜDCƏ İCMALI'!F11 — SUM of every planned line for the month. */
export function plannedExpenses(budgetLines: BudgetLine[], month: MonthKey): number {
  return sum(budgetLinesInMonth(budgetLines, month).map((line) => line.planned))
}

/** The full 'BÜDCƏ İCMALI' summary block for one month. */
export function summarise(data: FinanceData, month: MonthKey): MonthSummary {
  const plan = data.incomePlans.find((entry) => entry.month === month)
  const plannedIncome = round2(plannedIncomeOf(plan))
  const income = actualIncome(data.transactions, month)
  const expensesPlanned = plannedExpenses(data.budgetLines, month)
  const expensesActual = actualExpenses(data.transactions, month)

  const plannedRemainder = round2(plannedIncome - expensesPlanned)
  const actualRemainder = round2(income - expensesActual)

  return {
    month,
    plannedIncome,
    actualIncome: income,
    plannedExpenses: expensesPlanned,
    actualExpenses: expensesActual,
    plannedRemainder,
    actualRemainder,
    difference: round2(actualRemainder - plannedRemainder),
  }
}

/**
 * Running balance across every month up to and including `month`:
 * the accumulated actual income minus actual expenses. This is the
 * "how much do I have right now" number, and it is the sheet's D5 logic
 * applied to all history rather than a single file.
 */
export function runningBalance(transactions: Transaction[], month?: MonthKey): number {
  const relevant = month
    ? transactions.filter((transaction) => monthOf(transaction.date) <= month)
    : transactions
  return sum(
    relevant.map((transaction) =>
      transaction.type === 'income' ? transaction.amount : -transaction.amount,
    ),
  )
}

/**
 * The 'Aylıq rasxod' plan for one month, grouped by category so that planned
 * amounts and actual spend can be compared on the same footing.
 *
 * A category that was spent on without being planned still appears, so the
 * group actuals always add up to total actual expenses.
 */
export function budgetGroups(data: FinanceData, month: MonthKey): BudgetGroup[] {
  const lines = budgetLinesInMonth(data.budgetLines, month)
  const spendByCategory = expenseTotalsByCategory(data.transactions, month)

  const categories = new Set<string>()
  for (const line of lines) categories.add(line.category)
  for (const category of spendByCategory.keys()) categories.add(category)

  return [...categories]
    .map((category) => {
      const groupLines = lines.filter((line) => line.category === category)
      const planned = sum(groupLines.map((line) => line.planned))
      const actual = spendByCategory.get(category) ?? 0
      return {
        category: category as ExpenseCategory,
        lines: groupLines,
        planned,
        actual,
        variance: round2(planned - actual),
      }
    })
    .sort((a, b) => b.planned - a.planned || b.actual - a.actual)
}

function expenseTotalsByCategory(
  transactions: Transaction[],
  month: MonthKey,
): Map<string, number> {
  const totals = new Map<string, number[]>()
  for (const transaction of transactionsInMonth(transactions, month)) {
    if (transaction.type !== 'expense') continue
    const bucket = totals.get(transaction.category) ?? []
    bucket.push(transaction.amount)
    totals.set(transaction.category, bucket)
  }
  return new Map(
    [...totals].map(([category, amounts]) => [category, sum(amounts)]),
  )
}

/**
 * The 'Əlavə məlumatlar' rollup: SUMIF(category) over actual spend, alongside
 * the planned total for the same category.
 *
 * Categories with neither planned nor actual money are omitted — an empty row
 * carries no information. A category that is planned but unspent is kept,
 * because "budgeted and untouched" is meaningful.
 */
export function categoryTotals(data: FinanceData, month: MonthKey): CategoryTotal[] {
  const spendByCategory = expenseTotalsByCategory(data.transactions, month)
  const lines = budgetLinesInMonth(data.budgetLines, month)
  const totalActual = actualExpenses(data.transactions, month)

  // Include every known category plus any legacy category still present in data.
  const known = new Set<string>(EXPENSE_CATEGORIES)
  for (const key of spendByCategory.keys()) known.add(key)
  for (const line of lines) known.add(line.category)

  return [...known]
    .map((category) => {
      const planned = sum(
        lines.filter((line) => line.category === category).map((line) => line.planned),
      )
      const actual = spendByCategory.get(category) ?? 0
      return {
        category: category as ExpenseCategory,
        planned,
        actual,
        share: totalActual > 0 ? actual / totalActual : 0,
      }
    })
    .filter((total) => total.planned > 0 || total.actual > 0)
    .sort((a, b) => b.actual - a.actual || b.planned - a.planned)
}

/** Months that hold any data, newest first. Always includes `extra`. */
export function knownMonths(data: FinanceData, extra: MonthKey): MonthKey[] {
  const months = new Set<MonthKey>([extra])
  for (const transaction of data.transactions) months.add(monthOf(transaction.date))
  for (const line of data.budgetLines) months.add(line.month)
  for (const plan of data.incomePlans) months.add(plan.month)
  return [...months].sort().reverse()
}

/** Actual income / expenses / remainder per month, oldest first, for the trend. */
export function monthlyTrend(
  data: FinanceData,
  months: MonthKey[],
): { month: MonthKey; income: number; expenses: number; remainder: number }[] {
  return months.map((month) => {
    const income = actualIncome(data.transactions, month)
    const expenses = actualExpenses(data.transactions, month)
    return { month, income, expenses, remainder: round2(income - expenses) }
  })
}
