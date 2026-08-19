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
import { describeError } from '../lib/setupHints'
import { SyncingRepository } from '../lib/syncingRepository'
import type { SyncState } from '../lib/syncingRepository'
import {
  addCategory as addCategoryTo,
  removeCategory as removeCategoryFrom,
  renameCategory as renameCategoryIn,
  setCategoryKind as setCategoryKindIn,
} from '../lib/categories'
import {
  addPot as addPotTo,
  convertSavingTransactions,
  removePot as removePotFrom,
  renamePot as renamePotIn,
  setPotTarget as setPotTargetIn,
} from '../lib/savings'
import type {
  BudgetLine,
  CategoryKind,
  FinanceData,
  MonthKey,
  SavingsEntry,
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
   * Where this browser stands against the server. Local-only mode has nothing
   * to sync with, so it stays `synced`.
   */
  sync: SyncState
  /** The user closed the current sync message; a new one shows again. */
  syncMessageDismissed: boolean
  dismissSyncMessage(): void
  /** Send whatever is queued, now. */
  syncNow(): void
  retry(): void
  addTransaction(transaction: Omit<Transaction, 'id'>): void
  updateTransaction(id: string, patch: Omit<Transaction, 'id'>): void
  removeTransaction(id: string): void
  upsertBudgetLine(line: Omit<BudgetLine, 'id'> & { id?: string }): void
  removeBudgetLine(id: string): void
  /** Remove every planned line for one month, leaving its transactions alone. */
  clearMonthPlan(month: MonthKey): void
  setIncomePlan(month: MonthKey, amounts: Record<string, number>): void
  /** What to put away this month, per pot. Plans nothing else. */
  setSavingsPlan(month: MonthKey, amounts: Record<string, number>): void
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
  addSavingsPot(name: string, target?: number): void
  /** Renames the pot and every entry that named it, in one change. */
  renameSavingsPot(id: string, name: string): void
  /** Set or clear what the pot is being filled towards. Moves no money. */
  setSavingsPotTarget(id: string, target: number | undefined): void
  /** `reassignTo` is the pot anything still in this one moves to. A pot that
   *  still holds entries and has nowhere to send them is left alone. */
  removeSavingsPot(id: string, reassignTo?: string): void
  addSavingsEntry(entry: Omit<SavingsEntry, 'id'>): void
  updateSavingsEntry(id: string, patch: Omit<SavingsEntry, 'id'>): void
  removeSavingsEntry(id: string): void
  /** Turn savings recorded the old way — as spending into a category marked
   *  `saving` — into pot deposits. The expenses go, so nothing counts twice. */
  convertSavingsFromTransactions(): void
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
  const [sync, setSync] = useState<SyncState>({ status: 'synced', message: null })
  const [syncMessageDismissed, setSyncMessageDismissed] = useState(false)
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

  /** The repository reports where it stands; the UI reads it from here. */
  useEffect(() => {
    const syncing = repo.current
    if (!(syncing instanceof SyncingRepository)) return

    return syncing.subscribe((state) => {
      setSync(state)
      setSyncMessageDismissed(false)
    })
  }, [])

  const syncNow = useCallback(() => {
    const syncing = repo.current
    if (!(syncing instanceof SyncingRepository)) return

    void syncing.sync().then((merged) => {
      if (merged) setData(merged)
    })
  }, [])

  /**
   * Coming back online is the moment queued work can go out, and so is
   * returning to the tab. Nothing retries on a timer, because a timer fails at
   * exactly the rate of the thing that is not there.
   */
  useEffect(() => {
    if (!(repo.current instanceof SyncingRepository)) return

    const onVisible = () => {
      if (document.visibilityState === 'visible') syncNow()
    }
    window.addEventListener('online', syncNow)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', syncNow)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [syncNow])

  /**
   * Local state updates immediately and the write follows, so editing never
   * waits on the network. A write that cannot reach the server is queued by
   * the repository rather than rolling the screen back mid-edit.
   */
  const commit = useCallback((update: (previous: FinanceData) => FinanceData) => {
    setData((previous) => {
      const next = update(previous)
      // The syncing repository reports through its own state; this catches the
      // local-only path, where a failure to write this browser's own storage
      // is the whole story.
      repo.current.save(next).catch((cause: unknown) => {
        setSync({ status: 'failed', message: describeError(cause) })
      })
      return next
    })
  }, [])

  const value = useMemo<FinanceContextValue>(
    () => ({
      data,
      status,
      error,
      sync,
      syncMessageDismissed,
      dismissSyncMessage: () => setSyncMessageDismissed(true),
      syncNow,
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
          // The savings figure is part of the month's plan, so "delete the
          // plan" has to take it too; leaving it would resurrect a number
          // whose context is gone.
          savingsPlans: previous.savingsPlans.filter((plan) => plan.month !== month),
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

      setSavingsPlan(month, amounts) {
        commit((previous) => {
          const entry = {
            month,
            // A pot planned at zero carries no information, so it is not
            // stored — an absent key and a zero mean the same thing.
            amounts: Object.fromEntries(
              Object.entries(amounts)
                .map(([pot, amount]) => [pot, round2(amount)] as const)
                .filter(([, amount]) => amount > 0),
            ),
          }
          const exists = previous.savingsPlans.some((plan) => plan.month === month)
          return {
            ...previous,
            savingsPlans: exists
              ? previous.savingsPlans.map((plan) =>
                  plan.month === month ? entry : plan,
                )
              : [...previous.savingsPlans, entry],
          }
        })
      },

      applyTemplate(month) {
        commit((previous) => {
          if (previous.budgetLines.some((line) => line.month === month)) {
            return previous
          }
          // Carry the most recent month's plan forward. There is nothing else
          // to carry: an account holds only the plan its owner wrote, so with
          // no earlier month this does nothing rather than inventing one.
          const priorMonths = [
            ...new Set(previous.budgetLines.map((line) => line.month)),
          ]
            .filter((candidate) => candidate < month)
            .sort()
          const source = priorMonths.at(-1)
          if (!source) return previous

          const lines = previous.budgetLines
            .filter((line) => line.month === source)
            .map((line) => ({ ...line, id: nextId(), month }))

          const priorPlan = previous.incomePlans.find((plan) => plan.month === source)

          const priorSavings = previous.savingsPlans.find(
            (plan) => plan.month === source,
          )

          return {
            ...previous,
            budgetLines: [...previous.budgetLines, ...lines],
            incomePlans: previous.incomePlans.some((plan) => plan.month === month)
              ? previous.incomePlans
              : [
                  ...previous.incomePlans,
                  { month, amounts: { ...(priorPlan?.amounts ?? {}) } },
                ],
            savingsPlans: previous.savingsPlans.some((plan) => plan.month === month)
              ? previous.savingsPlans
              : [
                  ...previous.savingsPlans,
                  { month, amounts: { ...(priorSavings?.amounts ?? {}) } },
                ],
          }
        })
      },

      addSavingsPot(name, target) {
        commit((previous) =>
          addPotTo(previous, {
            id: nextId(),
            name,
            target: target && target > 0 ? round2(target) : undefined,
          }),
        )
      },

      renameSavingsPot(id, name) {
        commit((previous) => renamePotIn(previous, id, name))
      },

      setSavingsPotTarget(id, target) {
        commit((previous) => setPotTargetIn(previous, id, target))
      },

      removeSavingsPot(id, reassignTo) {
        commit((previous) => removePotFrom(previous, id, reassignTo))
      },

      addSavingsEntry(entry) {
        commit((previous) => ({
          ...previous,
          savingsEntries: [
            ...previous.savingsEntries,
            { ...entry, id: nextId(), amount: round2(entry.amount) },
          ],
        }))
      },

      updateSavingsEntry(id, patch) {
        commit((previous) => ({
          ...previous,
          savingsEntries: previous.savingsEntries.map((entry) =>
            entry.id === id ? { ...patch, id, amount: round2(patch.amount) } : entry,
          ),
        }))
      },

      removeSavingsEntry(id) {
        commit((previous) => ({
          ...previous,
          savingsEntries: previous.savingsEntries.filter((entry) => entry.id !== id),
        }))
      },

      convertSavingsFromTransactions() {
        commit((previous) => convertSavingTransactions(previous, nextId))
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
          // The pots are setup too — the goals somebody named — so a reset of
          // the figures empties them rather than deleting them.
          savingsPots: previous.savingsPots,
          savingsEntries: [],
          savingsPlans: [],
        }))
      },
    }),
    [data, status, error, sync, syncMessageDismissed, syncNow, commit],
  )

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
}

export function useFinance(): FinanceContextValue {
  const context = useContext(FinanceContext)
  if (!context) throw new Error('useFinance must be used inside FinanceProvider')
  return context
}
