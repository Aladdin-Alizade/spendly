/**
 * A period is a contiguous run of calendar months.
 *
 * Months are the unit because the spreadsheet budgets by month: planned
 * amounts only exist per month, so any period that is not a whole number of
 * months could not be compared against a plan.
 *
 * Every period is anchored to the month chosen in the header, so the two
 * controls compose: the switcher picks where, the selector picks how wide.
 */

import { shiftMonth } from './dates'
import type { MonthKey } from './types'

export type PeriodId = 'month' | 'last' | 'quarter' | 'half' | 'year'

export interface Period {
  id: PeriodId
  label: string
  /** Oldest first. Never empty. */
  months: MonthKey[]
}

export const PERIODS: { id: PeriodId; label: string; short: string }[] = [
  { id: 'month', label: 'Bu ay', short: 'Ay' },
  { id: 'last', label: 'Keçən ay', short: 'Keçən' },
  { id: 'quarter', label: '3 ay', short: '3 ay' },
  { id: 'half', label: '6 ay', short: '6 ay' },
  { id: 'year', label: 'Bu il', short: 'İl' },
]

/** Build the month list for a period anchored on `anchor`. */
export function resolvePeriod(id: PeriodId, anchor: MonthKey): Period {
  const label = PERIODS.find((entry) => entry.id === id)?.label ?? 'Bu ay'

  switch (id) {
    case 'last':
      return { id, label, months: [shiftMonth(anchor, -1)] }
    case 'quarter':
      return { id, label, months: span(anchor, 3) }
    case 'half':
      return { id, label, months: span(anchor, 6) }
    case 'year':
      return { id, label, months: yearToDate(anchor) }
    case 'month':
    default:
      return { id: 'month', label, months: [anchor] }
  }
}

/**
 * The equally-long run of months immediately before `period`, used for every
 * "compared with" figure. Comparing like with like keeps the deltas honest.
 */
export function previousPeriod(period: Period): Period {
  const length = period.months.length
  const end = shiftMonth(period.months[0], -1)
  return {
    id: period.id,
    label: `əvvəlki ${length === 1 ? 'ay' : `${length} ay`}`,
    months: span(end, length),
  }
}

/** True when the period covers exactly one month, which unlocks daily detail. */
export function isSingleMonth(period: Period): boolean {
  return period.months.length === 1
}

/** How a comparison should be worded, e.g. "keçən aya nisbətən". */
export function comparisonLabel(period: Period): string {
  const length = period.months.length
  return length === 1 ? 'keçən aya nisbətən' : `əvvəlki ${length} aya nisbətən`
}

/** `n` months ending at `end`, oldest first. */
function span(end: MonthKey, n: number): MonthKey[] {
  return Array.from({ length: n }, (_, index) => shiftMonth(end, index - (n - 1)))
}

/** January of the anchor's year through the anchor month itself. */
function yearToDate(anchor: MonthKey): MonthKey[] {
  const [year, month] = anchor.split('-').map(Number)
  return Array.from(
    { length: month },
    (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`,
  )
}
