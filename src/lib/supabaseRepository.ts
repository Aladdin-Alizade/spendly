/**
 * Supabase-backed persistence.
 *
 * The store still hands down a whole `FinanceData` snapshot on every change,
 * so this class works out what actually changed since the last write and sends
 * only that. A rename touches one row, not the entire history.
 *
 * Writes are serialised: two edits in quick succession queue rather than race,
 * which keeps the remote state consistent with what is on screen.
 */

import { supabase, currentUserId } from './supabase'
import { isCategoryKind, migrateCategory, migrateIncomePlan } from './types'
import { categoriesFromData } from './categories'
import { emptyData } from './storage'
import type { FinanceRepository } from './storage'
import type {
  BudgetLine,
  CategoryDef,
  FinanceData,
  IncomePlan,
  Transaction,
} from './types'

type Row = Record<string, unknown>

/**
 * Ids are minted here, in the browser, so they are only unique to one person.
 * They were not even that once: accounts made while the app handed out a
 * starting set of categories and a plan template all carry the same ids for
 * those rows, and those accounts still exist. The tables are keyed on
 * (user_id, id) for that reason, and every upsert says so, so a write is only
 * ever matched against a row this account owns. Matched against somebody
 * else's, it fails as a row level security violation — the row it collided
 * with is one the policies hide — and no edit gets saved.
 */
const BY_OWNER = { onConflict: 'user_id,id' } as const

export class SupabaseRepository implements FinanceRepository {
  /** The last snapshot known to be persisted, used to diff the next one. */
  private previous: FinanceData = emptyData
  /** Tail of the write queue, so saves apply in the order they were made. */
  private queue: Promise<unknown> = Promise.resolve()
  private userId: string | null = null

  async load(): Promise<FinanceData> {
    const client = requireClient()
    this.userId = await requireUser()

    const [transactions, budgetLines, incomePlans, categories] = await Promise.all([
      client.from('transactions').select('*'),
      client.from('budget_lines').select('*'),
      client.from('income_plans').select('*'),
      client.from('categories').select('*'),
    ])

    const failure =
      transactions.error ?? budgetLines.error ?? incomePlans.error ?? categories.error
    if (failure) throw failure

    const data: FinanceData = {
      transactions: (transactions.data ?? []).map(toTransaction),
      budgetLines: (budgetLines.data ?? []).map(toBudgetLine),
      incomePlans: (incomePlans.data ?? []).map(toIncomePlan),
      categories: (categories.data ?? []).map(toCategory),
    }

    // An account created before categories were stored has none of its own.
    // Its rows name the categories it used, so those come back and the next
    // save persists them. A new account has no rows either, and stays empty.
    if (data.categories.length === 0) {
      data.categories = categoriesFromData(data)
    }

    this.previous = data
    return data
  }

  /**
   * The returned promise rejects when the write failed, so the caller can say
   * so. The queue's own copy of it must not, or one rejected write would
   * poison every save that follows it.
   */
  save(data: FinanceData): Promise<void> {
    // Capture the baseline now so queued saves diff against the right state.
    const baseline = this.previous
    this.previous = data

    const write = this.queue.then(() => this.write(baseline, data))

    this.queue = write.catch(() => {
      // Re-sync on the next load rather than leaving a wrong baseline.
      this.previous = baseline
    })

    return write
  }

  private async write(before: FinanceData, after: FinanceData): Promise<void> {
    const client = requireClient()
    const userId = this.userId ?? (await requireUser())
    this.userId = userId

    const jobs: PromiseLike<{ error: unknown }>[] = []

    // --- transactions ---------------------------------------------------
    const txChanged = changedRows(before.transactions, after.transactions, (t) => ({
      id: t.id,
      user_id: userId,
      date: t.date,
      type: t.type,
      category: t.category,
      description: t.description,
      amount: t.amount,
      note: t.note ?? null,
    }))
    if (txChanged.upserts.length) {
      jobs.push(client.from('transactions').upsert(txChanged.upserts, BY_OWNER))
    }
    if (txChanged.removed.length) {
      jobs.push(client.from('transactions').delete().in('id', txChanged.removed))
    }

    // --- budget lines ------------------------------------------------------
    const lineChanged = changedRows(before.budgetLines, after.budgetLines, (l) => ({
      id: l.id,
      user_id: userId,
      month: l.month,
      description: l.description,
      category: l.category,
      planned: l.planned,
    }))
    if (lineChanged.upserts.length) {
      jobs.push(client.from('budget_lines').upsert(lineChanged.upserts, BY_OWNER))
    }
    if (lineChanged.removed.length) {
      jobs.push(client.from('budget_lines').delete().in('id', lineChanged.removed))
    }

    // --- categories ---------------------------------------------------------
    const categoryChanged = changedRows(before.categories, after.categories, (c) => ({
      id: c.id,
      user_id: userId,
      name: c.name,
      type: c.type,
      kind: c.kind ?? null,
    }))
    if (categoryChanged.upserts.length) {
      jobs.push(client.from('categories').upsert(categoryChanged.upserts, BY_OWNER))
    }
    if (categoryChanged.removed.length) {
      jobs.push(client.from('categories').delete().in('id', categoryChanged.removed))
    }

    // --- income plans (keyed by month, not by a generated id) --------------
    const planChanged = changedRows(
      before.incomePlans.map(withMonthKey),
      after.incomePlans.map(withMonthKey),
      (p) => ({
        user_id: userId,
        month: p.month,
        amounts: p.amounts,
      }),
    )
    if (planChanged.upserts.length) {
      jobs.push(
        client.from('income_plans').upsert(planChanged.upserts, {
          onConflict: 'user_id,month',
        }),
      )
    }
    if (planChanged.removed.length) {
      jobs.push(
        client.from('income_plans').delete().in('month', planChanged.removed),
      )
    }

    const results = await Promise.all(jobs)
    const failed = results.find((result) => result.error)
    if (failed?.error) throw failed.error
  }
}

/* ------------------------------------------------------------------ */

/**
 * Rows that appeared or changed, and ids that disappeared.
 * Comparison is on the serialised row, so an untouched record is not rewritten.
 */
export function changedRows<T extends { id: string }>(
  before: T[],
  after: T[],
  toRow: (item: T) => Row,
): { upserts: Row[]; removed: string[] } {
  const beforeById = new Map(before.map((item) => [item.id, toRow(item)]))
  const upserts: Row[] = []

  for (const item of after) {
    const row = toRow(item)
    const existing = beforeById.get(item.id)
    if (!existing || JSON.stringify(existing) !== JSON.stringify(row)) {
      upserts.push(row)
    }
  }

  const afterIds = new Set(after.map((item) => item.id))
  const removed = before
    .map((item) => item.id)
    .filter((id) => !afterIds.has(id))

  return { upserts, removed }
}

/** Income plans have no id column; the month is their identity. */
function withMonthKey(plan: IncomePlan): IncomePlan & { id: string } {
  return { ...plan, id: plan.month }
}

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

/**
 * The repository never signs anyone in. The app decides who is signed in and
 * only mounts this once someone is, so reaching here without a session is a
 * bug rather than a state to recover from.
 */
async function requireUser(): Promise<string> {
  const userId = await currentUserId()
  if (!userId) throw new Error('Hesaba daxil olunmayıb')
  return userId
}

/* --- row mapping. Postgres numerics can arrive as strings. ----------- */

function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toTransaction(row: Row): Transaction {
  return {
    id: String(row.id),
    date: String(row.date),
    type: row.type === 'income' ? 'income' : 'expense',
    category: migrateCategory(String(row.category)) as Transaction['category'],
    description: String(row.description),
    amount: num(row.amount),
    note: row.note ? String(row.note) : undefined,
  }
}

function toBudgetLine(row: Row): BudgetLine {
  return {
    id: String(row.id),
    month: String(row.month),
    description: String(row.description),
    category: migrateCategory(String(row.category)) as BudgetLine['category'],
    planned: num(row.planned),
  }
}

function toCategory(row: Row): CategoryDef {
  return {
    id: String(row.id),
    name: migrateCategory(String(row.name)),
    type: row.type === 'income' ? 'income' : 'expense',
    kind: isCategoryKind(row.kind) ? row.kind : undefined,
  }
}

/**
 * Rows written before income categories were editable have `salary` and
 * `additional` columns and an empty `amounts`; the migration reads whichever
 * of the two shapes the row is in.
 */
function toIncomePlan(row: Row): IncomePlan {
  const amounts = row.amounts as Record<string, unknown> | null
  const stored =
    amounts && Object.keys(amounts).length > 0
      ? Object.fromEntries(
          Object.entries(amounts).map(([category, value]) => [category, num(value)]),
        )
      : undefined

  return migrateIncomePlan({
    month: String(row.month),
    amounts: stored,
    salary: num(row.salary),
    additional: num(row.additional),
  })
}
