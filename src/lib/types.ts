/**
 * Domain model, derived from the "Oktyabr hesabat" spreadsheet.
 *
 * Sheet -> model mapping:
 *   'Aylıq rasxod'   row      -> BudgetLine   (description, category, planned amount)
 *   'Aylıq rasxod'   column E -> derived from Transactions of type 'expense'
 *   'BÜDCƏ İCMALI'   C11/C12  -> IncomePlan   (a planned amount per income
 *                                               category — the sheet had two
 *                                               fixed rows, this has one per
 *                                               category the user keeps)
 *   'BÜDCƏ İCMALI'   D11/D12  -> derived from Transactions of type 'income'
 */

/** Calendar month key, `YYYY-MM`. One month == one spreadsheet file. */
export type MonthKey = string

/** ISO calendar day, `YYYY-MM-DD`. */
export type DateKey = string

export type TransactionType = 'income' | 'expense'

/**
 * What a category is *for*, which is what the needs/wants frameworks measure.
 *
 * Deliberately optional. Nothing guesses it: an unclassified category stays
 * unclassified, and every analysis that depends on this reports how much of
 * the spending it could account for rather than quietly excluding the rest.
 *
 *   essential      — the household would struggle without it
 *   discretionary  — chosen rather than required
 *   debt           — a repayment on money already borrowed
 *   saving         — money set aside rather than consumed
 */
export type CategoryKind = 'essential' | 'discretionary' | 'debt' | 'saving'

export const CATEGORY_KINDS: CategoryKind[] = [
  'essential',
  'discretionary',
  'debt',
  'saving',
]

/**
 * A category is referenced by name, the way the spreadsheet did it and the way
 * every stored row already does. The id exists so a rename is an edit to one
 * record rather than a new category, and so the name can change without the
 * history losing track of which category it was.
 *
 * A new account holds none of these. Categories are the shape somebody gives
 * their own money, so the app hands out no starting set and no example plan —
 * the list is empty until its owner writes it.
 */
export interface CategoryDef {
  id: string
  name: string
  type: TransactionType
  /** Unset means unclassified, and the analyses say so. */
  kind?: CategoryKind
}

/** True for a value that is one of the four kinds, for reading stored data. */
export function isCategoryKind(value: unknown): value is CategoryKind {
  return typeof value === 'string' && (CATEGORY_KINDS as string[]).includes(value)
}

/**
 * Categories are user data, so these are plain strings. The named aliases are
 * kept because they say which side of the ledger a field belongs to, which a
 * bare `string` would not.
 */
export type ExpenseCategory = string
export type IncomeCategory = string
export type Category = string

/**
 * Categories were stored in Russian before the app was translated. Data saved
 * then is rewritten on load, so an existing transaction keeps its category
 * rather than falling out of every total.
 */
const LEGACY_CATEGORIES: Record<string, Category> = {
  'Кредиты': 'Kreditlər',
  'Еда': 'Ərzaq',
  'Транспорт': 'Nəqliyyat',
  'Транспорт ': 'Nəqliyyat',
  'Предметы личной гигиены': 'Şəxsi gigiyena',
  'Для телефона': 'Telefon və internet',
  'Обучение': 'Təhsil',
  'Спорт': 'İdman',
  'Развлечения': 'Əyləncə',
  'Подарки и благотворительность': 'Hədiyyə və xeyriyyə',
  'Лишние затраты': 'Əlavə xərclər',
  'Карта для машина': 'Avtomobil kartı',
  'Зарплата': 'Maaş',
  'Дополнительный доход': 'Əlavə gəlir',
}

/** Map a stored category onto the current set, leaving unknown ones untouched. */
export function migrateCategory(value: string): string {
  return LEGACY_CATEGORIES[value] ?? value
}

/** A real movement of money. Replaces the hand-totalled column E. */
export interface Transaction {
  id: string
  date: DateKey
  type: TransactionType
  category: Category
  description: string
  /** Always stored positive. Direction is carried by `type`. */
  amount: number
  note?: string
}

/** One planned expense row of 'Aylıq rasxod' (columns B, C, D). */
export interface BudgetLine {
  id: string
  month: MonthKey
  description: string
  category: ExpenseCategory
  /** Column D, "Запланированные затраты". Always >= 0. */
  planned: number
}

/**
 * The planned side of income, from 'BÜDCƏ İCMALI'!C11:C12.
 *
 * The sheet had exactly two rows for this, so the model used to have exactly
 * two fields. Income categories are the user's own now, so the plan is a
 * figure per category instead — keyed by category name, the way every other
 * reference to a category works.
 */
export interface IncomePlan {
  month: MonthKey
  /** Planned amount per income category name. Absent means nothing planned. */
  amounts: Record<string, number>
}

/**
 * Read an income plan saved in either shape.
 *
 * Snapshots written before income categories were editable carry `salary` and
 * `additional`; those two figures belong to the two categories that shape
 * stood for, so that is where they are put.
 */
export function migrateIncomePlan(value: unknown): IncomePlan {
  const raw = (value ?? {}) as Partial<IncomePlan> & {
    salary?: number
    additional?: number
  }
  const month = String(raw.month ?? '')

  if (raw.amounts && typeof raw.amounts === 'object') {
    const amounts: Record<string, number> = {}
    for (const [category, amount] of Object.entries(raw.amounts)) {
      const value = Number(amount)
      if (Number.isFinite(value)) amounts[migrateCategory(category)] = value
    }
    return { month, amounts }
  }

  // The two names the old two-field shape stood for. They are written out
  // here because nothing hands them out any more: an account keeps only the
  // income categories its owner made, and these are what the legacy figures
  // were always called.
  const SALARY = 'Maaş'
  const ADDITIONAL = 'Əlavə gəlir'
  const amounts: Record<string, number> = {}
  if (Number(raw.salary) > 0) amounts[SALARY] = Number(raw.salary)
  if (Number(raw.additional) > 0) amounts[ADDITIONAL] = Number(raw.additional)
  return { month, amounts }
}

/** Everything planned for a month, across its income categories. */
export function plannedIncomeOf(plan: IncomePlan | undefined): number {
  if (!plan) return 0
  return Object.values(plan.amounts).reduce((total, amount) => total + amount, 0)
}

export interface FinanceData {
  transactions: Transaction[]
  budgetLines: BudgetLine[]
  incomePlans: IncomePlan[]
  categories: CategoryDef[]
}
