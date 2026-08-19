/**
 * The frameworks that need to know what spending is *for*.
 *
 * All three of these — needs vs wants, 50/30/20, and an emergency-fund target
 * — are worthless unless the categories behind them are classified. So the
 * governing idea here is coverage: every result reports what share of the
 * month's spending it could actually account for, and refuses to draw a
 * conclusion below `CLASSIFICATION_COVERAGE_MIN`.
 *
 * The alternative — assuming an unclassified category is a need, or quietly
 * leaving it out of the denominator — produces a confident number that is
 * wrong, which is worse than no number.
 */

import { round2, sum } from '../money'
import { monthOf, shiftMonth } from '../dates'
import { actualIncome } from '../calc'
import { depositedFromIncome, savingsBalance } from '../savings'
import { median } from './advice'
import type { CategoryKind, FinanceData, MonthKey } from '../types'

/** Below this share of spending classified, the frameworks stay silent. */
export const CLASSIFICATION_COVERAGE_MIN = 0.9

/** How the four kinds read on screen. */
export const KIND_LABEL: Record<CategoryKind, string> = {
  essential: 'Zəruri',
  discretionary: 'İstəyə bağlı',
  debt: 'Borc ödənişi',
  saving: 'Yığım',
}

export interface SpendingSplit {
  essential: number
  discretionary: number
  debt: number
  saving: number
  /** Spending in categories with no kind set. */
  unclassified: number
  total: number
  /** Share of spending that carried a kind, 0..1. */
  coverage: number
  /** Names of the categories still unclassified, largest first. */
  missing: string[]
}

export function classifySpending(data: FinanceData, month: MonthKey): SpendingSplit {
  const kindOf = new Map(
    data.categories
      .filter((category) => category.type === 'expense')
      .map((category) => [category.name, category.kind]),
  )

  const totals: Record<CategoryKind, number> = {
    essential: 0,
    discretionary: 0,
    debt: 0,
    saving: 0,
  }
  const unclassifiedByCategory = new Map<string, number>()

  for (const transaction of data.transactions) {
    if (transaction.type !== 'expense') continue
    if (monthOf(transaction.date) !== month) continue

    const kind = kindOf.get(transaction.category)
    if (kind) {
      totals[kind] = round2(totals[kind] + transaction.amount)
    } else {
      unclassifiedByCategory.set(
        transaction.category,
        round2((unclassifiedByCategory.get(transaction.category) ?? 0) + transaction.amount),
      )
    }
  }

  const unclassified = sum([...unclassifiedByCategory.values()])
  const classified = sum(Object.values(totals))
  const total = round2(classified + unclassified)

  return {
    ...totals,
    unclassified,
    total,
    coverage: total > 0 ? classified / total : 0,
    missing: [...unclassifiedByCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category]) => category),
  }
}

/** True when there is enough classified spending to draw on. */
export function hasCoverage(split: SpendingSplit): boolean {
  return split.total > 0 && split.coverage >= CLASSIFICATION_COVERAGE_MIN
}

/* ------------------------------------------------------------------ *
 * 50/30/20
 * ------------------------------------------------------------------ */

/**
 * The reference split, from Warren & Tyagi's *All Your Worth* (2005), which
 * the CFPB teaches as one budgeting rule among several rather than as a
 * requirement.
 */
export const REFERENCE_50_30_20 = { needs: 0.5, wants: 0.3, savings: 0.2 } as const

export interface FrameworkSplit {
  needs: number
  wants: number
  savings: number
  income: number
  needsShare: number
  wantsShare: number
  savingsShare: number
  coverage: number
}

/**
 * Mapped onto the app's four kinds:
 *
 *   needs   = essential + debt
 *   wants   = discretionary
 *   savings = money set aside, plus whatever was simply not spent
 *
 * Debt sits with needs rather than with savings because *All Your Worth* puts
 * required debt payments among the must-haves; the 20% is what is saved, not
 * what is owed. The mapping is stated on screen so it can be disagreed with.
 */
export function fiftyThirtyTwenty(
  data: FinanceData,
  month: MonthKey,
): FrameworkSplit | null {
  const split = classifySpending(data, month)
  const income = actualIncome(data.transactions, month)
  if (income <= 0 || !hasCoverage(split)) return null

  const needs = round2(split.essential + split.debt)
  const wants = split.discretionary
  // What was not spent is retained, so it belongs on the savings side along
  // with anything deliberately set aside.
  const savings = round2(split.saving + (income - split.total))

  return {
    needs,
    wants,
    savings,
    income,
    needsShare: needs / income,
    wantsShare: wants / income,
    savingsShare: savings / income,
    coverage: split.coverage,
  }
}

/* ------------------------------------------------------------------ *
 * Emergency fund
 * ------------------------------------------------------------------ */

/** Months of history the estimate is drawn from. */
const ESTIMATE_WINDOW = 6
/** Fewer than this and a monthly figure is not an estimate, it is one month. */
const ESTIMATE_MIN_MONTHS = 3

export interface EmergencyFund {
  /** Median monthly essential spending — median, so one unusual month
   *  does not set the target. */
  essentialMonthly: number
  /** essentialMonthly × the chosen number of months. */
  target: number
  months: number
  /** How many months the estimate was drawn from. */
  sampleMonths: number
}

/**
 * A target, and only a target.
 *
 * The app never sees an account balance, so it cannot say how far along you
 * are — and it does not pretend to. The number of months is the user's to
 * choose: the CFPB deliberately publishes no universal figure, saying the
 * amount "depends on your situation".
 */
export function emergencyFund(
  data: FinanceData,
  month: MonthKey,
  months: number,
): EmergencyFund | null {
  const history: number[] = []

  for (let index = 0; index < ESTIMATE_WINDOW; index += 1) {
    const past = shiftMonth(month, -index)
    const split = classifySpending(data, past)
    if (split.total <= 0 || !hasCoverage(split)) continue
    history.push(round2(split.essential + split.debt))
  }

  if (history.length < ESTIMATE_MIN_MONTHS) return null

  const essentialMonthly = round2(median(history))
  if (essentialMonthly <= 0) return null

  return {
    essentialMonthly,
    target: round2(essentialMonthly * months),
    months,
    sampleMonths: history.length,
  }
}

/* ------------------------------------------------------------------ *
 * The figures behind the plain-language readings
 * ------------------------------------------------------------------ */

export interface Rigidity {
  /** Share of spending that is essential or debt — the part that cannot be
   *  dropped next month by deciding to. */
  rigidShare: number
  /** What is left: the discretionary spending, in manat. */
  flexible: number
}

/**
 * How much room the month actually has.
 *
 * A budget where nearly everything is rent, food and repayments is not worse
 * than one that is not — it simply has less give in it, and that is the thing
 * a percentage on its own never says.
 */
export function spendingRigidity(split: SpendingSplit): Rigidity | null {
  if (!hasCoverage(split)) return null
  return {
    rigidShare: (split.essential + split.debt) / split.total,
    flexible: split.discretionary,
  }
}

export interface FundPace {
  /** Income minus everything spent, this month. */
  retainedMonthly: number
  /** What was deliberately put away this month. */
  savingMonthly: number
  /** Already in the savings pots, as of the end of this month. */
  saved: number
  /** What is still missing, floored at zero once the target is met. */
  remaining: number
  /** Months to the target at the retained rate. Null when nothing is retained. */
  monthsAtRetained: number | null
  /** Months to the target at the deliberate-saving rate. */
  monthsAtSaving: number | null
}

/**
 * How long the rest of the target takes, at two different rates.
 *
 * The gap between them is the whole point. Money retained is money that was
 * not spent, which is not the same as money put away — and the difference
 * between "seven months" and "three years" is what makes that concrete.
 *
 * Both counts start from what is already in the pots. Estimating from the full
 * target once the money is visible would be telling somebody they are at the
 * beginning of a journey they are halfway through.
 */
export function fundPace(
  data: FinanceData,
  month: MonthKey,
  target: number,
): FundPace | null {
  const split = classifySpending(data, month)
  const income = actualIncome(data.transactions, month)
  if (income <= 0 || target <= 0) return null

  const retainedMonthly = round2(income - split.total)
  // Deposits made into a pot out of income, plus anything still recorded the
  // old way — as spending into a category marked `saving`. Both are the same
  // act, and an account part-way through the conversion holds some of each.
  const savingMonthly = round2(
    split.saving + depositedFromIncome(data.savingsEntries, month),
  )
  const saved = savingsBalance(data.savingsEntries, month)
  const remaining = round2(Math.max(target - saved, 0))

  return {
    retainedMonthly,
    savingMonthly,
    saved,
    remaining,
    monthsAtRetained: retainedMonthly > 0 ? remaining / retainedMonthly : null,
    monthsAtSaving: savingMonthly > 0 ? remaining / savingMonthly : null,
  }
}

/** Distance from each reference share, in percentage points. */
export function frameworkGaps(framework: FrameworkSplit) {
  return {
    needs: (framework.needsShare - REFERENCE_50_30_20.needs) * 100,
    wants: (framework.wantsShare - REFERENCE_50_30_20.wants) * 100,
    savings: (framework.savingsShare - REFERENCE_50_30_20.savings) * 100,
  }
}
