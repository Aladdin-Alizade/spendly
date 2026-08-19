/**
 * What the app does with an account that holds nothing.
 *
 * This is not an edge case any more — it is every account's first minute. A
 * new account has no categories, no plan and no transactions, so every figure
 * on all three screens is computed from an empty history. None of it may throw
 * or produce NaN: somebody who has just registered would meet a blank page
 * instead of the app they came for.
 */
import { describe, expect, it } from 'vitest'
import {
  budgetGroups,
  categoryTotals,
  knownMonths,
  monthlyTrend,
  runningBalance,
  summarise,
} from '../calc'
import {
  categoryBreakdown,
  dailyActivity,
  expectedSplit,
  flowBuckets,
  frequentExpenses,
  incomeSources,
  insights,
  largestTransactions,
  recurringCommitments,
  spendingPace,
  summarisePeriod,
  transactionsInPeriod,
  weekdayPattern,
} from '../analytics'
import { PERIODS, previousPeriod, resolvePeriod } from '../period'
import { budgetAdvice } from '../insights/advice'
import {
  classifySpending,
  emergencyFund,
  fiftyThirtyTwenty,
  fundPace,
  hasCoverage,
  spendingRigidity,
} from '../insights/classification'
import { emptyData } from '../storage'

const M = '2026-08'
const TODAY = '2026-08-19'

/** Every number the screens put on the page has to be a real one. */
const finite = (value: unknown): boolean =>
  typeof value !== 'number' || Number.isFinite(value)

function assertFinite(value: unknown): void {
  expect(finite(value)).toBe(true)
  if (Array.isArray(value)) value.forEach(assertFinite)
  else if (value && typeof value === 'object') Object.values(value).forEach(assertFinite)
}

describe('İcmal, on an account with nothing in it', () => {
  it('computes every period without a figure going missing', () => {
    for (const { id } of PERIODS) {
      const period = resolvePeriod(id, M)

      for (const value of [
        summarisePeriod(emptyData, period),
        categoryBreakdown(emptyData, period),
        expectedSplit(emptyData, period),
        flowBuckets(emptyData, period),
        incomeSources(emptyData, period),
        insights(emptyData, period),
        largestTransactions(emptyData, period, 5),
        weekdayPattern(emptyData, period),
        frequentExpenses(emptyData, period, 5),
        transactionsInPeriod(emptyData.transactions, period),
        summarisePeriod(emptyData, previousPeriod(period)),
      ]) {
        assertFinite(value)
      }
    }
  })

  it('has nothing to show for the month itself', () => {
    assertFinite(dailyActivity(emptyData, M))
    assertFinite(recurringCommitments(emptyData, M))
    assertFinite(spendingPace(emptyData, M, TODAY))
    expect(runningBalance(emptyData.transactions, M)).toBe(0)
    expect(knownMonths(emptyData, M)).toEqual([M])
    expect(monthlyTrend(emptyData, [M])).toHaveLength(1)
  })
})

describe('Büdcə, on an account with nothing in it', () => {
  it('shows an empty plan rather than failing to compute one', () => {
    expect(budgetGroups(emptyData, M)).toEqual([])
    expect(categoryTotals(emptyData, M)).toEqual([])

    const summary = summarise(emptyData, M)
    assertFinite(summary)
    expect(summary.plannedRemainder).toBe(0)
    expect(summary.actualRemainder).toBe(0)
  })
})

describe('Məsləhətlər, on an account with nothing in it', () => {
  it('produces a report instead of advice about nothing', () => {
    const report = budgetAdvice(emptyData, M, TODAY)
    assertFinite(report)
  })

  it('reports no coverage rather than dividing by an empty history', () => {
    const split = classifySpending(emptyData, M)
    assertFinite(split)
    expect(split.total).toBe(0)
    expect(hasCoverage(split)).toBe(false)

    // Each of these is a framework that needs spending to measure. With none,
    // they decline to answer — which is what the screen renders as "not enough
    // to say", rather than a percentage of nothing.
    expect(fiftyThirtyTwenty(emptyData, M)).toBeNull()
    expect(emergencyFund(emptyData, M, 3)).toBeNull()
    expect(spendingRigidity(split)).toBeNull()
    expect(fundPace(emptyData, M, 1000)).toBeNull()
  })
})
