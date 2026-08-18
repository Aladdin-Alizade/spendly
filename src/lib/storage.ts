/**
 * Persistence boundary.
 *
 * Everything above this file talks to `FinanceRepository` only, so the app
 * neither knows nor cares whether data lives in localStorage or in Postgres.
 *
 * The interface is async because a real backend is: making it so costs the
 * local implementation nothing and means adding one did not change the UI.
 */

import { seedData } from './seed'
import { defaultCategories, migrateCategory, migrateIncomePlan } from './types'
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
      if (raw === null) {
        const seeded = seedData()
        await this.save(seeded)
        return seeded
      }
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
  return {
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
    // A snapshot saved before categories were editable has none stored, so it
    // is given the starting set rather than an app with no categories at all.
    categories:
      Array.isArray(data.categories) && data.categories.length > 0
        ? data.categories.map((category: CategoryDef) => ({
            ...category,
            name: migrateCategory(category.name),
          }))
        : defaultCategories(),
  }
}
