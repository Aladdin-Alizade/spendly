/**
 * Category management.
 *
 * Categories are referenced by name everywhere the money is — that is how the
 * spreadsheet worked and how every stored row already reads. So a rename is
 * not an edit to one record: it has to carry every transaction and every
 * budget line that names the old category across with it, in the same change,
 * or the history falls out of its own totals.
 *
 * All of this is pure so the rule can be tested without a store or a browser.
 */

import type {
  CategoryDef,
  CategoryKind,
  FinanceData,
  IncomePlan,
  TransactionType,
} from './types'

export interface CategoryUsage {
  transactions: number
  budgetLines: number
  /** Months with a planned income figure under this category. */
  incomePlans: number
}

export function isCategoryInUse(usage: CategoryUsage): boolean {
  return usage.transactions > 0 || usage.budgetLines > 0 || usage.incomePlans > 0
}

/** How much history depends on a category, which is what makes deleting it
 *  a decision rather than a click. */
export function categoryUsage(data: FinanceData, name: string): CategoryUsage {
  return {
    transactions: data.transactions.filter((item) => item.category === name).length,
    budgetLines: data.budgetLines.filter((line) => line.category === name).length,
    // A category with a planned income figure and no transactions yet is still
    // in use: dropping it would delete the plan without saying so.
    incomePlans: data.incomePlans.filter((plan) => (plan.amounts[name] ?? 0) > 0)
      .length,
  }
}

/**
 * The categories a stored snapshot implies, for data written before categories
 * were records of their own.
 *
 * Nothing is invented here. Every name comes from a row that is already in the
 * data, so an account whose history predates the category list gets its own
 * list back rather than the app's idea of one — and a snapshot with no rows
 * implies no categories, which is exactly what a new account is.
 */
export function categoriesFromData(data: FinanceData): CategoryDef[] {
  const names = { expense: [] as string[], income: [] as string[] }

  const add = (type: TransactionType, name: string) => {
    const trimmed = name.trim()
    if (trimmed === '') return
    const seen = names[type].some(
      (existing) => existing.toLowerCase() === trimmed.toLowerCase(),
    )
    if (!seen) names[type].push(trimmed)
  }

  for (const transaction of data.transactions) add(transaction.type, transaction.category)
  // A budget line is always an expense; a planned income figure always income.
  for (const line of data.budgetLines) add('expense', line.category)
  for (const plan of data.incomePlans) {
    for (const name of Object.keys(plan.amounts)) add('income', name)
  }

  return (['expense', 'income'] as TransactionType[]).flatMap((type) =>
    names[type].map((name, index) => ({ id: `${type}-${index}`, name, type })),
  )
}

/** Categories of one side of the ledger, in the order they were added. */
export function categoriesOfType(
  data: FinanceData,
  type: TransactionType,
): CategoryDef[] {
  return data.categories.filter((category) => category.type === type)
}

/** The names only, which is what a `<select>` and the validator want. */
export function categoryNames(data: FinanceData, type: TransactionType): string[] {
  return categoriesOfType(data, type).map((category) => category.name)
}

/**
 * A name has to be there, and has to be unique within its own side of the
 * ledger — an expense and an income category may share a name without
 * ambiguity, because nothing ever looks a category up without its type.
 * Returns the reason it is rejected, or null when it is fine.
 */
export function validateCategoryName(
  data: FinanceData,
  name: string,
  type: TransactionType,
  /** The category being edited, so a name does not clash with itself. */
  currentId?: string,
): string | null {
  const trimmed = name.trim()
  if (trimmed === '') return 'Ad yazın'
  if (trimmed.length > 60) return 'Bu ad həddindən artıq uzundur'

  const clash = data.categories.some(
    (category) =>
      category.type === type &&
      category.id !== currentId &&
      category.name.trim().toLowerCase() === trimmed.toLowerCase(),
  )

  return clash ? 'Belə kateqoriya artıq var' : null
}

export interface PlannedIncomeRow {
  category: string
  planned: number
  /** The plan holds a figure for a category that no longer exists. */
  orphaned: boolean
}

/**
 * The planned-income lines for a month: one per income category, plus any
 * figure left behind by a category that has since gone.
 *
 * An orphan is shown rather than dropped. The alternative is a list of rows
 * that does not add up to its own total, which is how a planned amount goes
 * missing without anyone being told — and the figure is still editable here,
 * so it can be cleared or moved on purpose.
 */
export function plannedIncomeRows(
  categories: CategoryDef[],
  amounts: Record<string, number>,
): PlannedIncomeRow[] {
  const known = new Set(categories.map((category) => category.name))

  return [
    ...categories.map((category) => ({
      category: category.name,
      planned: amounts[category.name] ?? 0,
      orphaned: false,
    })),
    ...Object.entries(amounts)
      .filter(([category, amount]) => !known.has(category) && amount > 0)
      .map(([category, planned]) => ({ category, planned, orphaned: true })),
  ]
}

export function addCategory(
  data: FinanceData,
  category: CategoryDef,
): FinanceData {
  return { ...data, categories: [...data.categories, { ...category, name: category.name.trim() }] }
}

/**
 * Rename the category and everything that names it, in one step. Nothing here
 * touches an amount, so every total the app reports is unchanged by a rename.
 */
/**
 * Set or clear what a category is for.
 *
 * Only the definition moves. No transaction, budget line or planned figure is
 * touched, so classifying a category cannot change a single total the app
 * reports — it only decides which frameworks can read it.
 */
export function setCategoryKind(
  data: FinanceData,
  id: string,
  kind: CategoryKind | undefined,
): FinanceData {
  return {
    ...data,
    categories: data.categories.map((category) =>
      category.id === id ? { ...category, kind } : category,
    ),
  }
}

export function renameCategory(
  data: FinanceData,
  id: string,
  name: string,
): FinanceData {
  const target = data.categories.find((category) => category.id === id)
  const trimmed = name.trim()
  if (!target || trimmed === '' || target.name === trimmed) return data

  return {
    ...applyRename(data, target.name, trimmed, target.type),
    categories: data.categories.map((category) =>
      category.id === id ? { ...category, name: trimmed } : category,
    ),
  }
}

/**
 * Remove a category, moving anything that used it to `reassignTo` first.
 *
 * Without a destination, a category still in use is left alone: dropping it
 * would leave transactions pointing at a category that no longer exists, and
 * silently deleting the money behind it would be worse still.
 */
export function removeCategory(
  data: FinanceData,
  id: string,
  reassignTo?: string,
): FinanceData {
  const target = data.categories.find((category) => category.id === id)
  if (!target) return data

  const moved = reassignTo
    ? applyRename(data, target.name, reassignTo, target.type)
    : data

  if (!reassignTo && isCategoryInUse(categoryUsage(data, target.name))) {
    return data
  }

  return {
    ...moved,
    categories: moved.categories.filter((category) => category.id !== id),
  }
}

/**
 * Carry every reference across.
 *
 * Each side of the ledger is named in different places: an expense category by
 * transactions and by budget lines, an income category by transactions and by
 * the planned-income figures. Missing one of these is how a rename quietly
 * drops a planned amount, so all of them move together.
 */
function applyRename(
  data: FinanceData,
  from: string,
  to: string,
  type: TransactionType,
): FinanceData {
  return {
    ...data,
    transactions: data.transactions.map((transaction) =>
      transaction.type === type && transaction.category === from
        ? { ...transaction, category: to }
        : transaction,
    ),
    budgetLines:
      type === 'expense'
        ? data.budgetLines.map((line) =>
            line.category === from ? { ...line, category: to } : line,
          )
        : data.budgetLines,
    incomePlans:
      type === 'income'
        ? data.incomePlans.map((plan) => renameKey(plan, from, to))
        : data.incomePlans,
  }
}

/** Move a planned figure onto the new name, adding to whatever is already
 *  planned there — a rename onto an existing category merges the two. */
function renameKey(plan: IncomePlan, from: string, to: string): IncomePlan {
  if (!(from in plan.amounts)) return plan

  const { [from]: moved, ...rest } = plan.amounts
  return { ...plan, amounts: { ...rest, [to]: (rest[to] ?? 0) + moved } }
}
