/**
 * Persistence boundary.
 *
 * Everything above this file talks to `FinanceRepository` only, so the app
 * neither knows nor cares whether data lives in localStorage or in Postgres.
 *
 * The interface is async because a real backend is: making it so costs the
 * local implementation nothing and means adding one did not change the UI.
 */

import { categoriesFromData } from './categories'
import { isCategoryKind, migrateCategory, migrateIncomePlan } from './types'
import type {
  BudgetLine,
  Category,
  CategoryDef,
  FinanceData,
  Transaction,
} from './types'

export interface FinanceRepository {
  load(): Promise<FinanceData>
  save(data: FinanceData): Promise<void>
}

const STORAGE_KEY = 'spendly.data.v1'

export const emptyData: FinanceData = {
  transactions: [],
  budgetLines: [],
  incomePlans: [],
  categories: [],
}

export class LocalStorageRepository implements FinanceRepository {
  async load(): Promise<FinanceData> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      // Nothing stored means nothing to show. A first run gets an empty
      // account, not a stranger's categories and plan.
      if (raw === null) return emptyData
      return normaliseData(JSON.parse(raw))
    } catch {
      // Corrupt or unavailable storage must not brick the app.
      return emptyData
    }
  }

  async save(data: FinanceData): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // Quota or private-mode failures are non-fatal; the session still works.
    }
  }
}

/**
 * Defend against partially-shaped or hand-edited stored data, and bring
 * categories saved before the app was translated onto the current names.
 */
export function normaliseData(value: unknown): FinanceData {
  const data = (value ?? {}) as Partial<FinanceData>
  const normalised: FinanceData = {
    transactions: Array.isArray(data.transactions)
      ? data.transactions.map((transaction: Transaction) => ({
          ...transaction,
          category: migrateCategory(transaction.category) as Category,
        }))
      : [],
    budgetLines: Array.isArray(data.budgetLines)
      ? data.budgetLines.map((line: BudgetLine) => ({
          ...line,
          category: migrateCategory(line.category) as BudgetLine['category'],
        }))
      : [],
    incomePlans: Array.isArray(data.incomePlans)
      ? data.incomePlans.map(migrateIncomePlan)
      : [],
    categories: Array.isArray(data.categories)
      ? data.categories.map((category: CategoryDef) => ({
          ...category,
          name: migrateCategory(category.name),
          // An unrecognised kind is dropped rather than trusted.
          kind: isCategoryKind(category.kind) ? category.kind : undefined,
        }))
      : [],
  }

  // A snapshot saved before categories were editable has none stored. Its own
  // rows say which ones it used, and that is what it gets back — an empty
  // snapshot stays empty.
  return normalised.categories.length > 0
    ? normalised
    : { ...normalised, categories: categoriesFromData(normalised) }
}
