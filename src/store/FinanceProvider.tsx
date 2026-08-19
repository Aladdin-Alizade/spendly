import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { LocalStorageRepository, emptyData } from '../lib/storage'
import type { FinanceRepository } from '../lib/storage'
import { round2 } from '../lib/money'
import { budgetTemplate } from '../lib/seed'
import { describeError } from '../lib/setupHints'
import {
  addCategory as addCategoryTo,
  removeCategory as removeCategoryFrom,
  renameCategory as renameCategoryIn,
  setCategoryKind as setCategoryKindIn,
} from '../lib/categories'
import type {
  BudgetLine,
  CategoryKind,
  FinanceData,
  MonthKey,
  Transaction,
  TransactionType,
} from '../lib/types'

export type LoadStatus = 'loading' | 'ready' | 'error'

interface FinanceContextValue {
  data: FinanceData
  status: LoadStatus
  /** Set when loading failed, so the UI can say what went wrong. */
  error: string | null
  /**
   * Set when the last write did not reach the backend. The edit is still on
   * screen — it is in local state — but it is not saved, and saying nothing
   * would let it read as though it were.
   *
   * An empty string is a failure with nothing further to say about it; `null`
   * means the last write succeeded.
   */
  saveError: string | null
  dismissSaveError(): void
  retry(): void
  addTransaction(transaction: Omit<Transaction, 'id'>): void
  updateTransaction(id: string, patch: Omit<Transaction, 'id'>): void
  removeTransaction(id: string): void
  upsertBudgetLine(line: Omit<BudgetLine, 'id'> & { id?: string }): void
  removeBudgetLine(id: string): void
  /** Remove every planned line for one month, leaving its transactions alone. */
  clearMonthPlan(month: MonthKey): void
  setIncomePlan(month: MonthKey, amounts: Record<string, number>): void
  addCategory(name: string, type: TransactionType, kind?: CategoryKind): void
  /** Set or clear what a category is for. Touches no amount. */
  setCategoryKind(id: string, kind: CategoryKind | undefined): void
  /** Renames the category and everything that referenced it, in one change. */
  renameCategory(id: string, name: string): void
  /** `reassignTo` is the category anything still using this one moves to. A
   *  category that is in use and has nowhere to go is left alone. */
  removeCategory(id: string, reassignTo?: string): void
  /** Copy the recurring plan into a month that has none yet. */
  applyTemplate(month: MonthKey): void
  /** Delete every transaction, plan and budget line. Not reversible. */
  resetAll(): void
}

const FinanceContext = createContext<FinanceContextValue | null>(null)

let idCounter = 0

/**
 * Ids are generated on the client so the UI can update before a write lands.
 * A UUID keeps them unique across devices sharing one account; the counter
 * fallback covers browsers without `crypto.randomUUID`.
 */
function nextId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  idCounter += 1
  return `${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`
}

export function FinanceProvider({
  children,
  repository = new LocalStorageRepository(),
}: {
  children: ReactNode
  repository?: FinanceRepository
}) {
  const repo = useRef(repository)
  const [data, setData] = useState<FinanceData>(emptyData)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setError(null)

    repo.current
      .load()
      .then((loaded) => {
        if (cancelled) return
        setData(loaded)
        setStatus('ready')
      })
      .catch((cause) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'Məlumatlarınızı yükləmək mümkün olmadı')
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  /**
   * Local state updates immediately and the write follows, so editing never
   * waits on the network. A failed write is reported by the repository and
   * reconciled on the next load rather than rolling the screen back mid-edit.
   */
  const commit = useCallback((update: (previous: FinanceData) => FinanceData) => {
    setData((previous) => {
      const next = update(previous)
      repo.current.save(next).then(
        () => setSaveError(null),
        // An empty description still means the write failed, so it is kept as
        // a marker: the banner then says that much and nothing it cannot back
        // up. `null` is the only value that means "saved".
        (cause: unknown) => setSaveError(describeError(cause)),
      )
      return next
    })
  }, [])

  const value = useMemo<FinanceContextValue>(
    () => ({
      data,
      status,
      error,
      saveError,
      dismissSaveError: () => setSaveError(null),
      retry: () => setAttempt((value) => value + 1),

      addTransaction(transaction) {
        commit((previous) => ({
          ...previous,
          transactions: [
            ...previous.transactions,
            { ...transaction, id: nextId(), amount: round2(transaction.amount) },
          ],
        }))
      },

      updateTransaction(id, patch) {
        commit((previous) => ({
          ...previous,
          transactions: previous.transactions.map((transaction) =>
            transaction.id === id
              ? { ...patch, id, amount: round2(patch.amount) }
              : transaction,
          ),
        }))
      },

      removeTransaction(id) {
        commit((previous) => ({
          ...previous,
          transactions: previous.transactions.filter(
            (transaction) => transaction.id !== id,
          ),
        }))
      },

      upsertBudgetLine(line) {
        commit((previous) => {
          const planned = round2(line.planned)
          if (line.id) {
            return {
              ...previous,
              budgetLines: previous.budgetLines.map((existing) =>
                existing.id === line.id
                  ? { ...existing, ...line, id: line.id, planned }
                  : existing,
              ),
            }
          }
          return {
            ...previous,
            budgetLines: [
              ...previous.budgetLines,
              { ...line, id: nextId(), planned },
            ],
          }
        })
      },

      removeBudgetLine(id) {
        commit((previous) => ({
          ...previous,
          budgetLines: previous.budgetLines.filter((line) => line.id !== id),
        }))
      },

      clearMonthPlan(month) {
        commit((previous) => ({
          ...previous,
          budgetLines: previous.budgetLines.filter((line) => line.month !== month),
          incomePlans: previous.incomePlans.filter((plan) => plan.month !== month),
        }))
      },

      setIncomePlan(month, amounts) {
        commit((previous) => {
          const entry = {
            month,
            // A category planned at zero carries no information, so it is not
            // stored — an absent key and a zero mean the same thing.
            amounts: Object.fromEntries(
              Object.entries(amounts)
                .map(([category, amount]) => [category, round2(amount)] as const)
                .filter(([, amount]) => amount > 0),
            ),
          }
          const exists = previous.incomePlans.some((plan) => plan.month === month)
          return {
            ...previous,
            incomePlans: exists
              ? previous.incomePlans.map((plan) =>
                  plan.month === month ? entry : plan,
                )
              : [...previous.incomePlans, entry],
          }
        })
      },

      applyTemplate(month) {
        commit((previous) => {
          if (previous.budgetLines.some((line) => line.month === month)) {
            return previous
          }
          // Carry forward the most recent month's plan, or the sheet's original.
          const priorMonths = [
            ...new Set(previous.budgetLines.map((line) => line.month)),
          ]
            .filter((candidate) => candidate < month)
            .sort()
          const source = priorMonths.at(-1)
          const lines = source
            ? previous.budgetLines
                .filter((line) => line.month === source)
                .map((line) => ({ ...line, id: nextId(), month }))
            : budgetTemplate(month)

          const priorPlan = source
            ? previous.incomePlans.find((plan) => plan.month === source)
            : undefined

          return {
            ...previous,
            budgetLines: [...previous.budgetLines, ...lines],
            incomePlans: previous.incomePlans.some((plan) => plan.month === month)
              ? previous.incomePlans
              : [
                  ...previous.incomePlans,
                  { month, amounts: { ...(priorPlan?.amounts ?? {}) } },
                ],
          }
        })
      },

      addCategory(name, type, kind) {
        commit((previous) =>
          addCategoryTo(previous, { id: nextId(), name, type, kind }),
        )
      },

      setCategoryKind(id, kind) {
        commit((previous) => setCategoryKindIn(previous, id, kind))
      },

      renameCategory(id, name) {
        commit((previous) => renameCategoryIn(previous, id, name))
      },

      removeCategory(id, reassignTo) {
        commit((previous) => removeCategoryFrom(previous, id, reassignTo))
      },

      resetAll() {
        // The category list is the user's own setup, not their history, so a
        // reset of the figures leaves it standing.
        commit((previous) => ({
          transactions: [],
          budgetLines: [],
          incomePlans: [],
          categories: previous.categories,
        }))
      },
    }),
    [data, status, error, saveError, commit],
  )

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
}

export function useFinance(): FinanceContextValue {
  const context = useContext(FinanceContext)
  if (!context) throw new Error('useFinance must be used inside FinanceProvider')
  return context
}
