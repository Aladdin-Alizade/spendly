/**
 * Bringing a device's unsent work together with what the server holds.
 *
 * The rule, in one sentence: **rows this device changed while it could not
 * reach the server win; every other row comes from the server.**
 *
 * That is last-writer-wins at row granularity, biased towards the device with
 * unsent work — which is the only rule that can be applied without storing a
 * timestamp on every row, and the only one that never silently discards
 * something the person typed here. Two devices editing the same transaction
 * while both offline is the case it cannot resolve; the one that syncs second
 * wins, and nothing is lost that was not deliberately replaced.
 *
 * `base` is the last snapshot known to have been on the server. Without it
 * there is no way to tell a row this device deleted from a row the server has
 * not seen yet, which is why it is stored rather than recomputed.
 */

import type { CategoryDef, FinanceData, SavingsPot } from './types'

export function mergeFinanceData(
  base: FinanceData,
  local: FinanceData,
  remote: FinanceData,
): FinanceData {
  return {
    transactions: mergeRows(base.transactions, local.transactions, remote.transactions, (t) => t.id),
    budgetLines: mergeRows(base.budgetLines, local.budgetLines, remote.budgetLines, (l) => l.id),
    incomePlans: mergeRows(base.incomePlans, local.incomePlans, remote.incomePlans, (p) => p.month),
    categories: dedupeCategories(
      mergeRows(base.categories, local.categories, remote.categories, (c) => c.id),
    ),
    savingsPots: dedupePots(
      mergeRows(base.savingsPots, local.savingsPots, remote.savingsPots, (p) => p.id),
    ),
    savingsEntries: mergeRows(
      base.savingsEntries,
      local.savingsEntries,
      remote.savingsEntries,
      (e) => e.id,
    ),
    savingsPlans: mergeRows(
      base.savingsPlans,
      local.savingsPlans,
      remote.savingsPlans,
      (p) => p.month,
    ),
  }
}

/** Two ids, one pot — the same collision categories have, for the same reason:
 *  a pot is unique by name on the server, and every entry names its pot. */
function dedupePots(pots: SavingsPot[]): SavingsPot[] {
  const seen = new Set<string>()
  return pots.filter((pot) => {
    const key = pot.name.trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Two ids, one category.
 *
 * A browser that has never synced holds the categories it was given here,
 * under ids of its own making. An account that was used elsewhere first holds
 * the same names under different ids. Merging by id alone keeps both, and the
 * server rejects the pair outright — a category is unique per (user, type,
 * name) there, which is the rule that makes a rename possible at all.
 *
 * So a duplicate by name is resolved in favour of the server's row. Nothing is
 * lost by dropping the local one: every transaction, budget line and planned
 * figure refers to a category by name, never by id.
 */
function dedupeCategories(categories: CategoryDef[]): CategoryDef[] {
  const seen = new Set<string>()
  // Merged order is the server's first, so the surviving id is the server's —
  // the one every other device already agrees on.
  return categories.filter((category) => {
    const key = `${category.type}\u0000${category.name.trim().toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * One collection.
 *
 * Order follows the server's, with anything added here appended — a merge
 * should not reshuffle a list the user has not touched.
 */
export function mergeRows<T>(
  base: T[],
  local: T[],
  remote: T[],
  idOf: (item: T) => string,
): T[] {
  const baseById = new Map(base.map((item) => [idOf(item), item]))
  const localById = new Map(local.map((item) => [idOf(item), item]))

  // What this device did since the last sync.
  const changedHere = new Map(
    [...localById].filter(([id, item]) => !same(baseById.get(id), item)),
  )
  const deletedHere = new Set(
    [...baseById.keys()].filter((id) => !localById.has(id)),
  )

  const merged = new Map<string, T>()
  for (const item of remote) {
    const id = idOf(item)
    if (deletedHere.has(id)) continue
    merged.set(id, changedHere.get(id) ?? item)
  }
  // Rows added here that the server has never seen keep their place at the end.
  for (const [id, item] of changedHere) {
    if (!merged.has(id)) merged.set(id, item)
  }

  return [...merged.values()]
}

/** True when the device holds work the server has not acknowledged. */
export function hasPendingWork(base: FinanceData, local: FinanceData): boolean {
  return !same(base, local)
}

/** Structural comparison. The snapshots are plain data, so this is exact. */
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
