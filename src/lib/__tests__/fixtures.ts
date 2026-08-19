/**
 * The "Oktyabr hesabat" spreadsheet, as test data.
 *
 * The app itself hands out nothing: an account starts with no categories and
 * no plan, because those are the shape somebody gives their own money. But the
 * sheet is still the only independently-known-good set of figures this project
 * has, so it lives on here — the fidelity tests check the calculations against
 * the totals a person once worked out by hand.
 */

import type { BudgetLine, CategoryDef, MonthKey, TransactionType } from '../types'

/** The data-validation list on 'Aylıq rasxod'!C3:C25, translated. */
const EXPENSE_CATEGORIES = [
  'Kreditlər',
  'Ərzaq',
  'Nəqliyyat',
  'Şəxsi gigiyena',
  'Telefon və internet',
  'Təhsil',
  'İdman',
  'Əyləncə',
  'Hədiyyə və xeyriyyə',
  'Əlavə xərclər',
  'Avtomobil kartı',
]

/** 'BÜDCƏ İCMALI'!B11 and B12 — the sheet's two income rows. */
const INCOME_CATEGORIES = ['Maaş', 'Əlavə gəlir']

/**
 * The recurring plan carried over from 'Aylıq rasxod' (October report).
 * Planned total is 1,142.00 ₼, matching 'BÜDCƏ İCMALI'!F11.
 *
 * The sheet's empty placeholder rows (category only, no description or amount)
 * are omitted — they carry no information.
 */
const PLAN: [description: string, category: string, planned: number][] = [
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
export const PLANNED_SALARY = 990

/** The sheet's 16 budget lines, applied to one month. */
export function sheetPlan(month: MonthKey): BudgetLine[] {
  return PLAN.map(([description, category, planned], index) => ({
    id: `${month}-plan-${index}`,
    month,
    description,
    category,
    planned,
  }))
}

/** A category list covering both sides of the sheet's ledger. */
export function sheetCategories(): CategoryDef[] {
  const of = (names: string[], type: TransactionType): CategoryDef[] =>
    names.map((name, index) => ({ id: `cat-${type}-${index}`, name, type }))

  return [...of(EXPENSE_CATEGORIES, 'expense'), ...of(INCOME_CATEGORIES, 'income')]
}
