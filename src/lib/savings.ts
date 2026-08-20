/**
 * The savings pots: what is in them, and what moving money changes.
 *
 * The rule the whole file follows: **a pot holds money that still exists.**
 * Setting money aside is not spending it, so a deposit never appears in a
 * spending total; taking it back out is not earning, so a withdrawal never
 * appears in income. What a deposit does change is which side of the line the
 * money sits on, and that is exactly what `spendableDelta` reports.
 *
 * Everything here is pure, so the arithmetic can be tested without a store,
 * a browser or an account.
 */

import { monthOf } from './dates'
import { round2, sum } from './money'
import type {
  DateKey,
  FinanceData,
  MonthKey,
  SavingsEntry,
  SavingsPlan,
  SavingsPot,
} from './types'

/** Entries dated on or before the end of `month`. Undefined means all history. */
function upTo(entries: SavingsEntry[], month?: MonthKey): SavingsEntry[] {
  return month ? entries.filter((entry) => monthOf(entry.date) <= month) : entries
}

function signed(entry: SavingsEntry): number {
  return entry.direction === 'in' ? entry.amount : -entry.amount
}

/** Everything in every pot, as of the end of `month`. */
export function savingsBalance(entries: SavingsEntry[], month?: MonthKey): number {
  return round2(sum(upTo(entries, month).map(signed)))
}

/** One pot's balance, as of the end of `month`. */
export function potBalance(
  entries: SavingsEntry[],
  pot: string,
  month?: MonthKey,
): number {
  return round2(
    sum(upTo(entries, month).filter((entry) => entry.pot === pot).map(signed)),
  )
}

/**
 * What the savings pots did to the spendable side in one month.
 *
 * A deposit made out of income takes money off the spendable side; a
 * withdrawal puts it back. A deposit from outside was never spendable, so it
 * changes nothing here — it only grows the pot. This is the term that keeps
 * the balance on screen equal to the money actually available to spend.
 */
export function spendableDelta(entries: SavingsEntry[], month?: MonthKey): number {
  return spendableDeltaOf(upTo(entries, month))
}

/** The same sum over a list already narrowed to a window — a week of a chart,
 *  a month of a trend — where the caller has done the filtering. */
export function spendableDeltaOf(entries: SavingsEntry[]): number {
  return round2(
    sum(
      entries.map((entry) => {
        if (entry.direction === 'out') return entry.amount
        return entry.source === 'external' ? 0 : -entry.amount
      }),
    ),
  )
}

/**
 * Money that arrived from outside during one month and went straight to a pot.
 * It grows what the household holds without ever passing through income, which
 * is exactly why it needs its own figure — no income report will show it.
 */
export function depositedFromOutside(
  entries: SavingsEntry[],
  month: MonthKey,
): number {
  return round2(
    sum(
      entries
        .filter(
          (entry) =>
            monthOf(entry.date) === month &&
            entry.direction === 'in' &&
            entry.source === 'external',
        )
        .map((entry) => entry.amount),
    ),
  )
}

/** Entries dated inside one month, newest first. */
export function entriesInMonth(
  entries: SavingsEntry[],
  month: MonthKey,
): SavingsEntry[] {
  return entries
    .filter((entry) => monthOf(entry.date) === month)
    .slice()
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
}

/** Set aside out of income during one month — the deliberate saving rate. */
export function depositedFromIncome(
  entries: SavingsEntry[],
  month: MonthKey,
): number {
  return round2(
    sum(
      entries
        .filter(
          (entry) =>
            monthOf(entry.date) === month &&
            entry.direction === 'in' &&
            entry.source !== 'external',
        )
        .map((entry) => entry.amount),
    ),
  )
}

export interface PotRow {
  pot: SavingsPot | null
  name: string
  balance: number
  target?: number
  /** 0..1 against the target, or null when the pot has none. */
  progress: number | null
  entries: number
  /** True for money in a pot whose definition has gone. */
  orphaned: boolean
}

/**
 * Every pot with what is in it, plus any balance left behind by a pot that was
 * deleted while it still held money.
 *
 * The orphan is shown rather than dropped, for the same reason an orphaned
 * planned-income figure is: a list that does not add up to its own total is
 * how money goes missing without anyone being told.
 */
export function potRows(data: FinanceData, month?: MonthKey): PotRow[] {
  const known = new Set(data.savingsPots.map((pot) => pot.name))
  const visible = upTo(data.savingsEntries, month)

  const rows: PotRow[] = data.savingsPots.map((pot) => {
    const balance = potBalance(data.savingsEntries, pot.name, month)
    return {
      pot,
      name: pot.name,
      balance,
      target: pot.target,
      progress: pot.target && pot.target > 0 ? balance / pot.target : null,
      entries: visible.filter((entry) => entry.pot === pot.name).length,
      orphaned: false,
    }
  })

  const orphanNames = [
    ...new Set(visible.map((entry) => entry.pot).filter((name) => !known.has(name))),
  ]

  return [
    ...rows,
    ...orphanNames.map((name) => ({
      pot: null,
      name,
      balance: potBalance(data.savingsEntries, name, month),
      target: undefined,
      progress: null,
      entries: visible.filter((entry) => entry.pot === name).length,
      orphaned: true,
    })),
  ]
}

/**
 * A name has to be there and has to be unique. Returns the reason it is
 * rejected, or null when it is fine.
 */
export function validatePotName(
  data: FinanceData,
  name: string,
  /** The pot being edited, so a name does not clash with itself. */
  currentId?: string,
): string | null {
  const trimmed = name.trim()
  if (trimmed === '') return 'Ad yazın'
  if (trimmed.length > 60) return 'Bu ad həddindən artıq uzundur'

  const clash = data.savingsPots.some(
    (pot) =>
      pot.id !== currentId &&
      pot.name.trim().toLowerCase() === trimmed.toLowerCase(),
  )

  return clash ? 'Belə qab artıq var' : null
}

export function addPot(data: FinanceData, pot: SavingsPot): FinanceData {
  return {
    ...data,
    savingsPots: [...data.savingsPots, { ...pot, name: pot.name.trim() }],
  }
}

/** Rename the pot and everything that names it, in one change. Touches no
 *  amount, so no balance moves. */
/**
 * Carry every reference across.
 *
 * A pot is named in two places, not one: by the entries that moved money into
 * and out of it, and by the month's savings plan, which is keyed by pot name
 * the way the income plan is keyed by category name. Moving only the entries
 * is how renaming a pot silently orphaned the figure somebody had planned for
 * it — the money stayed, the plan it was measured against did not.
 *
 * A move onto a pot that is already planned for adds the two together, the
 * same way the income side does.
 */
export function movePotReferences(
  data: FinanceData,
  from: string,
  to: string,
): FinanceData {
  return {
    ...data,
    savingsEntries: data.savingsEntries.map((entry) =>
      entry.pot === from ? { ...entry, pot: to } : entry,
    ),
    savingsPlans: data.savingsPlans.map((plan) => {
      if (!(from in plan.amounts)) return plan
      const { [from]: moved, ...rest } = plan.amounts
      return { ...plan, amounts: { ...rest, [to]: (rest[to] ?? 0) + moved } }
    }),
  }
}

export function renamePot(
  data: FinanceData,
  id: string,
  name: string,
): FinanceData {
  const target = data.savingsPots.find((pot) => pot.id === id)
  const trimmed = name.trim()
  if (!target || trimmed === '' || target.name === trimmed) return data

  return {
    ...movePotReferences(data, target.name, trimmed),
    savingsPots: data.savingsPots.map((pot) =>
      pot.id === id ? { ...pot, name: trimmed } : pot,
    ),
  }
}

/** Set or clear what the pot is being filled towards. */
export function setPotTarget(
  data: FinanceData,
  id: string,
  target: number | undefined,
): FinanceData {
  return {
    ...data,
    savingsPots: data.savingsPots.map((pot) =>
      pot.id === id
        ? { ...pot, target: target && target > 0 ? round2(target) : undefined }
        : pot,
    ),
  }
}

/**
 * Remove a pot, moving whatever it holds to `reassignTo` first.
 *
 * Without a destination, a pot that still has entries is left alone: deleting
 * it would either strand the money or silently destroy a record of it, and
 * both are worse than refusing.
 */
export function removePot(
  data: FinanceData,
  id: string,
  reassignTo?: string,
): FinanceData {
  const target = data.savingsPots.find((pot) => pot.id === id)
  if (!target) return data

  const used = data.savingsEntries.some((entry) => entry.pot === target.name)
  if (used && !reassignTo) return data

  const moved = reassignTo ? movePotReferences(data, target.name, reassignTo) : data

  return {
    ...moved,
    savingsPots: moved.savingsPots.filter((pot) => pot.id !== id),
  }
}

/**
 * Money already recorded as a saving-kind expense, ready to become entries.
 *
 * Before pots existed the only way to record setting money aside was to spend
 * it into a category marked `saving`. Those rows are the same event written
 * the only way the app allowed at the time, so they convert exactly: the
 * category becomes the pot, and the source is income, because an expense is
 * by definition money the household already had.
 *
 * Returns the transactions to convert and the entries they become. Nothing is
 * applied here — the screen offers it and the person decides.
 */
export function convertibleSavingTransactions(data: FinanceData): {
  transactions: string[]
  pots: string[]
  total: number
} {
  const savingCategories = new Set(
    data.categories
      .filter((category) => category.type === 'expense' && category.kind === 'saving')
      .map((category) => category.name),
  )

  const matched = data.transactions.filter(
    (transaction) =>
      transaction.type === 'expense' && savingCategories.has(transaction.category),
  )

  return {
    transactions: matched.map((transaction) => transaction.id),
    pots: [...new Set(matched.map((transaction) => transaction.category))],
    total: round2(sum(matched.map((transaction) => transaction.amount))),
  }
}

/**
 * Apply that conversion: every matching expense becomes a deposit, and the
 * expense itself goes, because leaving it would count the same money twice.
 *
 * `mintId` is passed in rather than imported so this stays pure and the ids
 * are the app's own.
 */
export function convertSavingTransactions(
  data: FinanceData,
  mintId: () => string,
): FinanceData {
  const savingCategories = new Set(
    data.categories
      .filter((category) => category.type === 'expense' && category.kind === 'saving')
      .map((category) => category.name),
  )

  const matched = data.transactions.filter(
    (transaction) =>
      transaction.type === 'expense' && savingCategories.has(transaction.category),
  )
  if (matched.length === 0) return data

  const existingPots = new Set(data.savingsPots.map((pot) => pot.name))
  const newPots = [...new Set(matched.map((transaction) => transaction.category))]
    .filter((name) => !existingPots.has(name))
    .map((name) => ({ id: mintId(), name }))

  const entries: SavingsEntry[] = matched.map((transaction) => ({
    id: mintId(),
    date: transaction.date as DateKey,
    pot: transaction.category,
    amount: transaction.amount,
    direction: 'in' as const,
    source: 'income' as const,
    note: transaction.description,
  }))

  const converted = new Set(matched.map((transaction) => transaction.id))

  return {
    ...data,
    transactions: data.transactions.filter(
      (transaction) => !converted.has(transaction.id),
    ),
    savingsPots: [...data.savingsPots, ...newPots],
    savingsEntries: [...data.savingsEntries, ...entries],
  }
}

/* ------------------------------------------------------------------ *
 * The planned side
 * ------------------------------------------------------------------ */

/** Everything meant to be put away in one month, across its pots. */
export function plannedSavings(plans: SavingsPlan[], month: MonthKey): number {
  const plan = plans.find((entry) => entry.month === month)
  if (!plan) return 0
  return round2(sum(Object.values(plan.amounts)))
}

export interface PlannedSavingsRow {
  pot: string
  planned: number
  /** The plan holds a figure for a pot that no longer exists. */
  orphaned: boolean
}

/**
 * The planned-savings lines for a month: one per pot, plus any figure left
 * behind by a pot that has since gone.
 *
 * The orphan stays visible for the same reason it does on the income side —
 * a list of rows that does not add up to its own total is how a planned
 * amount disappears without anyone being told.
 */
export function plannedSavingsRows(
  pots: SavingsPot[],
  amounts: Record<string, number>,
): PlannedSavingsRow[] {
  const known = new Set(pots.map((pot) => pot.name))

  return [
    ...pots.map((pot) => ({
      pot: pot.name,
      planned: amounts[pot.name] ?? 0,
      orphaned: false,
    })),
    ...Object.entries(amounts)
      .filter(([pot, amount]) => !known.has(pot) && amount > 0)
      .map(([pot, planned]) => ({ pot, planned, orphaned: true })),
  ]
}
