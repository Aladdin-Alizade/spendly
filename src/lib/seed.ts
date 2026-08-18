import { currentMonth } from './dates'
import { INCOME_CATEGORIES, defaultCategories } from './types'
import type { BudgetLine, ExpenseCategory, FinanceData, MonthKey } from './types'

/**
 * The recurring plan carried over from 'Aylıq rasxod' (October report).
 * Planned total is 1,142.00 ₼, matching 'BÜDCƏ İCMALI'!F11.
 *
 * The sheet's empty placeholder rows (category only, no description or amount)
 * are omitted — they carry no information. Categories are copied verbatim,
 * including the ones that look surprising, because they are the user's own.
 */
const PLAN: [description: string, category: ExpenseCategory, planned: number][] = [
  ['Ev kirəsi', 'Əlavə xərclər', 230],
  ['Adi kredit kartı', 'Kreditlər', 220],
  ['Umiko kredit kartı', 'Kreditlər', 35],
  ['Nağd kredit kartı', 'Kreditlər', 0],
  ['Qızıl krediti', 'Kreditlər', 300],
  ['İnternet', 'Telefon və internet', 15],
  ['Nəqliyyat (İş)', 'Nəqliyyat', 25],
  ['Nəqliyyat (Kurs)', 'Təhsil', 12],
  ['Saç', 'Şəxsi gigiyena', 20],
  ['Lazer', 'Şəxsi gigiyena', 10],
  ['Geyim və ayaqqabı', 'Şəxsi gigiyena', 35],
  ['Ev üçün ərzaq', 'Ərzaq', 100],
  ['Özüm üçün ərzaq', 'Ərzaq', 0],
  ['İdman aylıq', 'İdman', 40],
  ['Avtomobil icarəsi', 'Əlavə xərclər', 50],
  ['Ad günləri', 'Əlavə xərclər', 50],
]

/** 'BÜDCƏ İCMALI'!C11 — planned salary. */
const PLANNED_SALARY = 990

export function budgetTemplate(month: MonthKey): BudgetLine[] {
  return PLAN.map(([description, category, planned], index) => ({
    id: `${month}-seed-${index}`,
    month,
    description,
    category,
    planned,
  }))
}

/** First-run data: the recurring plan, applied to the current month. */
export function seedData(): FinanceData {
  const month = currentMonth()
  return {
    transactions: [],
    budgetLines: budgetTemplate(month),
    incomePlans: [{ month, amounts: { [INCOME_CATEGORIES[0]]: PLANNED_SALARY } }],
    categories: defaultCategories(),
  }
}
