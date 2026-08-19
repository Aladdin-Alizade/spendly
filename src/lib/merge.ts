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

import type { FinanceData } from './types'

export function mergeFinanceData(
  base: FinanceData,
  local: FinanceData,
  remote: FinanceData,
): FinanceData {
  return {
    transactions: mergeRows(base.transactions, local.transactions, remote.transactions, (t) => t.id),
    budgetLines: mergeRows(base.budgetLines, local.budgetLines, remote.budgetLines, (l) => l.id),
    incomePlans: mergeRows(base.incomePlans, local.incomePlans, remote.incomePlans, (p) => p.month),
    categories: mergeRows(base.categories, local.categories, remote.categories, (c) => c.id),
  }
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
