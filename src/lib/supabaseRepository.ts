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
import {
  isCategoryKind,
  isSavingsDirection,
  isSavingsSource,
  migrateCategory,
  migrateIncomePlan,
} from './types'
import { categoriesFromData } from './categories'
import { emptyData } from './storage'
import type { FinanceRepository } from './storage'
import type {
  BudgetLine,
  CategoryDef,
  FinanceData,
  IncomePlan,
  SavingsEntry,
  SavingsPlan,
  SavingsPot,
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
const BY_OWNER = 'user_id,id'

/** Income and savings plans have no id of their own; the month is their key. */
const BY_MONTH = 'user_id,month'

/** Rows asked for per read. The server caps this as well — Supabase ships
 *  `db-max-rows` set to 1000 — which is why nothing here treats a short page
 *  as the end of the table. */
export const PAGE_ROWS = 1000

/** Rows written per request. */
const WRITE_ROWS = 500

/** Keys per delete. These travel in the URL, which is the short one. */
export const DELETE_KEYS = 100

export function batched<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size))
  }
  return batches
}

/**
 * Every row of a table, in pages.
 *
 * PostgREST answers with at most `db-max-rows` rows and says nothing about it.
 * A single unpaged request therefore looked like a complete answer while
 * quietly being the first thousand rows, and the merge then wrote that
 * truncated picture back over the browser's own copy: an account with more
 * history than that watched a shifting subset of it appear and disappear.
 *
 * So the total comes from the server's own count rather than from the size of
 * a page, and `order` keeps the pages from overlapping — without it PostgREST
 * is free to answer in any order it likes and an offset means nothing.
 */
export async function selectAll(
  client: NonNullable<typeof supabase>,
  table: string,
  order: string,
): Promise<Row[]> {
  const rows: Row[] = []
  let total: number | null = null

  for (;;) {
    // Counting is what makes the end of the table knowable, so it is asked
    // for once and not on every page.
    const { data, error, count } = await client
      .from(table)
      .select('*', { count: total === null ? 'exact' : undefined })
      .order(order, { ascending: true })
      .range(rows.length, rows.length + PAGE_ROWS - 1)

    if (error) throw error

    const page = (data ?? []) as Row[]
    if (page.length === 0) break
    rows.push(...page)

    if (total === null && typeof count === 'number') total = count
    if (total !== null && rows.length >= total) break
    // No count came back, so the end of the table is not knowable from here;
    // a short page is the best signal left.
    if (total === null && page.length < PAGE_ROWS) break
  }

  return rows
}

export class SupabaseRepository implements FinanceRepository {
  /** The last snapshot known to be persisted, used to diff the next one. */
  private previous: FinanceData = emptyData
  /** Tail of the write queue, so saves apply in the order they were made. */
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    /**
     * The account this repository was built for.
     *
     * A store can outlive the account it was made for — a save begun before
     * somebody signed out can land after somebody else has signed in — and
     * without this it would land as them: one person's rows written into
     * another person's account.
     */
    private readonly owner?: string | null,
  ) {}

  async load(): Promise<FinanceData> {
    return withTokenRetry(() => this.read())
  }

  private async read(): Promise<FinanceData> {
    const client = requireClient()
    await this.requireUser()

    const [
      transactions,
      budgetLines,
      incomePlans,
      categories,
      pots,
      entries,
      savingsPlans,
    ] = await Promise.all([
      selectAll(client, 'transactions', 'id'),
      selectAll(client, 'budget_lines', 'id'),
      selectAll(client, 'income_plans', 'month'),
      selectAll(client, 'categories', 'id'),
      selectAll(client, 'savings_pots', 'id'),
      selectAll(client, 'savings_entries', 'id'),
      selectAll(client, 'savings_plans', 'month'),
    ])

    const data: FinanceData = {
      transactions: transactions.map(toTransaction),
      budgetLines: budgetLines.map(toBudgetLine),
      incomePlans: incomePlans.map(toIncomePlan),
      categories: categories.map(toCategory),
      savingsPots: pots.map(toPot),
      savingsEntries: entries.map(toEntry),
      savingsPlans: savingsPlans.map(toSavingsPlan),
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
   *
   * The baseline is read when the write runs rather than when it is queued.
   * Reading it at queue time meant a save that failed left the one behind it
   * diffing against a state the server had never accepted, so the rows the
   * failed write was carrying were never sent again — an edit that reported a
   * failure and then quietly stayed missing after the retry appeared to work.
   */
  save(data: FinanceData): Promise<void> {
    const write = this.queue.then(async () => {
      const baseline = this.previous
      this.previous = data
      try {
        await withTokenRetry(() => this.write(baseline, data))
      } catch (cause) {
        // Re-sync on the next load rather than leaving a wrong baseline.
        this.previous = baseline
        throw cause
      }
    })

    this.queue = write.catch(() => undefined)

    return write
  }

  private async write(before: FinanceData, after: FinanceData): Promise<void> {
    const client = requireClient()
    const userId = await this.requireUser()

    const jobs: PromiseLike<{ error: unknown }>[] = []

    /** Rows go up in batches, so a first sync of a long history is a series
     *  of requests rather than one the server refuses outright. */
    const send = (table: string, rows: Row[], onConflict: string) => {
      for (const batch of batched(rows, WRITE_ROWS)) {
        jobs.push(client.from(table).upsert(batch, { onConflict }))
      }
    }

    /**
     * The keys of a delete travel in the URL, which is the short one: an id is
     * around forty characters once escaped, and "delete everything" on a real
     * history built a request line long enough for the gateway to refuse it.
     * Clearing an account worked for somebody with fifty rows and failed for
     * somebody with five hundred.
     */
    const drop = (table: string, column: string, keys: string[]) => {
      for (const batch of batched(keys, DELETE_KEYS)) {
        jobs.push(client.from(table).delete().in(column, batch))
      }
    }

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
    send('transactions', txChanged.upserts, BY_OWNER)
    drop('transactions', 'id', txChanged.removed)

    // --- budget lines ------------------------------------------------------
    const lineChanged = changedRows(before.budgetLines, after.budgetLines, (l) => ({
      id: l.id,
      user_id: userId,
      month: l.month,
      description: l.description,
      category: l.category,
      planned: l.planned,
    }))
    send('budget_lines', lineChanged.upserts, BY_OWNER)
    drop('budget_lines', 'id', lineChanged.removed)

    // --- categories ---------------------------------------------------------
    const categoryChanged = changedRows(before.categories, after.categories, (c) => ({
      id: c.id,
      user_id: userId,
      name: c.name,
      type: c.type,
      kind: c.kind ?? null,
    }))
    send('categories', categoryChanged.upserts, BY_OWNER)
    drop('categories', 'id', categoryChanged.removed)

    // --- savings pots -------------------------------------------------------
    const potChanged = changedRows(before.savingsPots, after.savingsPots, (p) => ({
      id: p.id,
      user_id: userId,
      name: p.name,
      target: p.target ?? null,
    }))
    send('savings_pots', potChanged.upserts, BY_OWNER)
    drop('savings_pots', 'id', potChanged.removed)

    // --- savings entries ----------------------------------------------------
    const entryChanged = changedRows(
      before.savingsEntries,
      after.savingsEntries,
      (e) => ({
        id: e.id,
        user_id: userId,
        date: e.date,
        pot: e.pot,
        amount: e.amount,
        direction: e.direction,
        source: e.source ?? null,
        note: e.note ?? null,
      }),
    )
    send('savings_entries', entryChanged.upserts, BY_OWNER)
    drop('savings_entries', 'id', entryChanged.removed)

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
    send('income_plans', planChanged.upserts, BY_MONTH)
    drop('income_plans', 'month', planChanged.removed)

    // --- savings plans (keyed by month, like income plans) ------------------
    const savingsPlanChanged = changedRows(
      before.savingsPlans.map(withMonthKey),
      after.savingsPlans.map(withMonthKey),
      (p) => ({
        user_id: userId,
        month: p.month,
        amounts: p.amounts,
      }),
    )
    send('savings_plans', savingsPlanChanged.upserts, BY_MONTH)
    drop('savings_plans', 'month', savingsPlanChanged.removed)

    const results = await Promise.all(jobs)
    const failed = results.find((result) => result.error)
    if (failed?.error) throw failed.error
  }

  /**
   * Who this write belongs to.
   *
   * The repository never signs anyone in. The app decides who is signed in and
   * only mounts this once someone is, so reaching here without a session is a
   * bug rather than a state to recover from — and so is reaching it as
   * somebody other than the owner, which is a store that has outlived its
   * account still trying to write.
   */
  private async requireUser(): Promise<string> {
    const userId = await currentUserId()
    if (!userId) throw new Error('Hesaba daxil olunmayıb')
    if (this.owner && this.owner !== userId) throw new Error('Hesaba daxil olunmayıb')
    return userId
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

/** The month stands in for an id, so the diff can key on it like any row. */
function withMonthKey<T extends { month: string }>(plan: T): T & { id: string } {
  return { ...plan, id: plan.month }
}

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

/* --- refused over the token, not over the account -------------------- */

/** Everything the backend said, as one string to match against. */
function described(cause: unknown): string {
  const error = cause as { code?: unknown; message?: unknown } | null
  return [error?.code, error?.message].filter((part) => typeof part === 'string').join(' ')
}

/**
 * The token is stamped ahead of the server's clock.
 *
 * Refreshing makes this worse, not better: a new token is stamped further
 * ahead still. The only thing that helps is waiting for the clocks to meet.
 */
const isClockSkew = (cause: unknown) => /PGRST303|issued at future/i.test(described(cause))

/**
 * The token has run out. Whether it had is not something this side can know —
 * the expiry it holds is arithmetic on the browser's own clock, and a browser
 * whose clock is behind believes a dead token is still good. The server's
 * refusal is the only authority, so that is what triggers the refresh.
 */
const isTokenExpired = (cause: unknown) =>
  /PGRST301|jwt expired|JWSError|invalid claim/i.test(described(cause))

const CLOCK_SKEW_WAIT_MS = 1500

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * One attempt, and a second one when the first was refused over the token.
 *
 * Neither refusal is somebody being signed out. Before this, both surfaced as
 * "Sessiya bitib. Yenidən daxil olun." on a session nobody had ended — and
 * signing in again appeared to fix it only because it happened to mint a token
 * while the clocks agreed.
 */
async function withTokenRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (cause) {
    if (isClockSkew(cause)) {
      await pause(CLOCK_SKEW_WAIT_MS)
      return run()
    }
    if (isTokenExpired(cause)) {
      await supabase?.auth.refreshSession()
      return run()
    }
    throw cause
  }
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
function toPot(row: Row): SavingsPot {
  const target = row.target === null || row.target === undefined ? 0 : num(row.target)
  return {
    id: String(row.id),
    name: String(row.name),
    target: target > 0 ? target : undefined,
  }
}

function toEntry(row: Row): SavingsEntry {
  // A stored direction is trusted only when it is one of the two; anything
  // else is read as a deposit, so the amount survives a bad row.
  const direction = isSavingsDirection(row.direction) ? row.direction : 'in'
  return {
    id: String(row.id),
    date: String(row.date),
    pot: String(row.pot),
    amount: num(row.amount),
    direction,
    source:
      direction === 'in'
        ? isSavingsSource(row.source)
          ? row.source
          : 'income'
        : undefined,
    note: row.note ? String(row.note) : undefined,
  }
}

function toSavingsPlan(row: Row): SavingsPlan {
  const stored = (row.amounts ?? {}) as Record<string, unknown>
  return {
    month: String(row.month),
    amounts: Object.fromEntries(
      Object.entries(stored)
        .map(([pot, amount]) => [pot, num(amount)] as const)
        .filter(([, amount]) => amount > 0),
    ),
  }
}

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
