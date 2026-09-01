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
import { isRecordedAt } from './dates'
import {
  isCategoryKind,
  isSavingsDirection,
  isSavingsSource,
  isRepeatKind,
  migrateCategory,
  migrateIncomePlan,
} from './types'
import type {
  BudgetLine,
  Category,
  CategoryDef,
  FinanceData,
  SavingsEntry,
  SavingsPlan,
  SavingsPot,
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
  savingsPots: [],
  savingsEntries: [],
  savingsPlans: [],
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
      // There is no server behind this one, so storage that will not take the
      // change means the edit is nowhere. Saying nothing would leave it on
      // screen looking saved until the tab is next opened.
      throw new Error('Bu brauzerin yaddaşı doludur.')
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
          repeats: isRepeatKind(transaction.repeats) ? transaction.repeats : undefined,
          recordedAt: isRecordedAt(transaction.recordedAt)
            ? transaction.recordedAt
            : undefined,
        }))
      : [],
    budgetLines: Array.isArray(data.budgetLines)
      ? data.budgetLines.map((line: BudgetLine) => ({
          ...line,
          category: migrateCategory(line.category) as BudgetLine['category'],
          done: Boolean(line.done),
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
    savingsPots: Array.isArray(data.savingsPots)
      ? data.savingsPots.map((pot: SavingsPot) => ({
          ...pot,
          name: String(pot.name ?? '').trim(),
          // A target of zero and no target say the same thing; only one of
          // them makes the screens draw a progress bar to nowhere.
          target:
            typeof pot.target === 'number' && pot.target > 0 ? pot.target : undefined,
        }))
      : [],
    savingsEntries: Array.isArray(data.savingsEntries)
      ? data.savingsEntries.map((entry: SavingsEntry) => {
          // An unreadable direction is read as a deposit rather than dropped:
          // the row is a record of money, and guessing wrong about which way
          // it went is recoverable, losing it is not.
          const direction = isSavingsDirection(entry.direction)
            ? entry.direction
            : 'in'
          return {
            ...entry,
            direction,
            source:
              direction === 'in'
                ? isSavingsSource(entry.source)
                  ? entry.source
                  : 'income'
                : undefined,
          }
        })
      : [],
    savingsPlans: Array.isArray(data.savingsPlans)
      ? data.savingsPlans.map((plan: SavingsPlan) => ({
          month: String(plan.month),
          amounts: Object.fromEntries(
            Object.entries(plan.amounts ?? {})
              .map(([pot, amount]) => [pot, Number(amount)] as const)
              // A figure that will not parse is dropped rather than turned
              // into a zero, which would read as a deliberate plan of nothing.
              .filter(([, amount]) => Number.isFinite(amount) && amount > 0),
          ),
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
