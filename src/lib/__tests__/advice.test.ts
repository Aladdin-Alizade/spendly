import { describe, expect, it } from 'vitest'
import { budgetAdvice, median, robustScore } from '../insights/advice'
import { sheetCategories } from './fixtures'
import type { BudgetLine, FinanceData, Transaction } from '../types'

const M = '2026-08'
const TODAY = '2026-08-20'

function build(partial: Partial<FinanceData> = {}): FinanceData {
  return {
    transactions: [],
    budgetLines: [],
    incomePlans: [],
    categories: sheetCategories(),
    savingsPots: [],
    savingsEntries: [],
    savingsPlans: [],
    ...partial,
  }
}

let counter = 0
function tx(over: Partial<Transaction> = {}): Transaction {
  counter += 1
  return {
    id: `t${counter}`,
    date: `${M}-05`,
    type: 'expense',
    category: 'Ərzaq',
    description: 'Test',
    amount: 10,
    ...over,
  }
}

function line(over: Partial<BudgetLine> = {}): BudgetLine {
  counter += 1
  return {
    id: `b${counter}`,
    month: M,
    description: 'Plan',
    category: 'Ərzaq',
    planned: 100,
    ...over,
  }
}

const income = (month: string, amount: number) =>
  tx({ date: `${month}-01`, type: 'income', category: 'Maaş', amount })

const spend = (month: string, category: string, amount: number) =>
  tx({ date: `${month}-10`, category, amount })

const all = (report: ReturnType<typeof budgetAdvice>) => [
  ...report.attention,
  ...report.good,
  ...report.review,
]
const ids = (report: ReturnType<typeof budgetAdvice>) => all(report).map((a) => a.id)

/* ------------------------------------------------------------------ */

describe('budget health', () => {
  it('reports the month arithmetic', () => {
    const data = build({
      transactions: [income(M, 3000), spend(M, 'Ərzaq', 2400)],
      budgetLines: [line({ planned: 2000 })],
    })

    const { health } = budgetAdvice(data, M, TODAY)
    expect(health).toMatchObject({
      income: 3000,
      expenses: 2400,
      remaining: 600,
      plannedExpenses: 2000,
      planVariance: 400,
    })
    expect(health.spendingRatio).toBeCloseTo(0.8)
    expect(health.retainedRate).toBeCloseTo(0.2)
  })

  it('leaves the ratios null rather than dividing by nothing', () => {
    const { health } = budgetAdvice(build({ transactions: [spend(M, 'Ərzaq', 50)] }), M, TODAY)
    expect(health.spendingRatio).toBeNull()
    expect(health.retainedRate).toBeNull()
    expect(health.planVariance).toBeNull()
  })
})

describe('silence when the data cannot support a rule', () => {
  it('says nothing at all for an empty month', () => {
    const report = budgetAdvice(build(), M, TODAY)
    expect(all(report)).toEqual([])
  })

  it('records why each rule stayed silent', () => {
    const report = budgetAdvice(build(), M, TODAY)
    const methods = report.unavailable.map((entry) => entry.method)
    expect(methods).toContain('spending-ratio')
    expect(methods).toContain('variance')
    expect(methods).toContain('anomaly')
    expect(report.unavailable.every((entry) => entry.reason.length > 0)).toBe(true)
  })

  it('gives no plan advice when there is no plan', () => {
    const data = build({ transactions: [income(M, 1000), spend(M, 'Ərzaq', 400)] })
    expect(ids(budgetAdvice(data, M, TODAY))).not.toContain('total-variance')
  })
})

describe('variance', () => {
  it('reports a category over its plan, with the amount', () => {
    const data = build({
      transactions: [income(M, 1000), spend(M, 'Ərzaq', 420)],
      budgetLines: [line({ planned: 300 })],
    })

    const advice = all(budgetAdvice(data, M, TODAY)).find((a) => a.id === 'variance-Ərzaq')
    expect(advice?.priority).toBe('attention')
    expect(advice?.fact).toContain('120.00 ₼')
  })

  it('ignores a variance too small to matter', () => {
    const data = build({
      transactions: [income(M, 1000), spend(M, 'Ərzaq', 302)],
      budgetLines: [line({ planned: 300 })],
    })
    expect(ids(budgetAdvice(data, M, TODAY))).not.toContain('variance-Ərzaq')
  })

  it('treats coming in under plan as a good thing', () => {
    const data = build({
      transactions: [income(M, 1000), spend(M, 'Ərzaq', 200)],
      budgetLines: [line({ planned: 300 })],
    })
    const advice = all(budgetAdvice(data, M, TODAY)).find((a) => a.id === 'variance-Ərzaq')
    expect(advice?.priority).toBe('good')
  })

  it('does not repeat the health figures as advice when nothing is wrong', () => {
    // Income and the retained rate are already displayed above the list.
    const data = build({
      transactions: [income(M, 1000), spend(M, 'Ərzaq', 200)],
      budgetLines: [line({ planned: 300 })],
    })
    const found = ids(budgetAdvice(data, M, TODAY))
    expect(found).not.toContain('spending-ratio')
    expect(found).not.toContain('retained')
  })

  it('does raise it when the month does not pay for itself', () => {
    const data = build({
      transactions: [income(M, 100), spend(M, 'Ərzaq', 400)],
    })
    const report = budgetAdvice(data, M, TODAY)
    const overspent = report.attention.find((a) => a.id === 'overspent')

    // One card, not two: the ratio and the shortfall are the same fact.
    expect(overspent).toBeDefined()
    expect(overspent?.fact).toContain('300.00 ₼')
    expect(report.attention.filter((a) => a.method === 'spending-ratio')).toHaveLength(1)
  })
})

describe('repeated overrun', () => {
  it('fires at three of the last four months', () => {
    const months = ['2026-05', '2026-06', '2026-07', '2026-08']
    const data = build({
      transactions: [
        ...months.map((m) => income(m, 1000)),
        ...months.map((m, index) => spend(m, 'Ərzaq', index === 1 ? 80 : 150)),
      ],
      budgetLines: months.map((m) => line({ month: m, planned: 100 })),
    })

    const advice = all(budgetAdvice(data, '2026-08', TODAY)).find(
      (a) => a.id === 'repeated-Ərzaq',
    )
    expect(advice?.priority).toBe('attention')
    expect(advice?.fact).toContain('4 ayın 3')
  })

  it('stays quiet at two of four', () => {
    const months = ['2026-05', '2026-06', '2026-07', '2026-08']
    const data = build({
      transactions: [
        ...months.map((m) => income(m, 1000)),
        ...months.map((m, index) => spend(m, 'Ərzaq', index < 2 ? 150 : 80)),
      ],
      budgetLines: months.map((m) => line({ month: m, planned: 100 })),
    })
    expect(ids(budgetAdvice(data, '2026-08', TODAY))).not.toContain('repeated-Ərzaq')
  })
})

describe('anomaly detection', () => {
  const steady = ['2026-04', '2026-05', '2026-06', '2026-07']

  it('flags a month far outside the usual range', () => {
    const data = build({
      transactions: [
        ...steady.map((m) => income(m, 1000)),
        ...steady.map((m, index) => spend(m, 'Nəqliyyat', [150, 145, 155, 150][index])),
        income(M, 1000),
        spend(M, 'Nəqliyyat', 350),
      ],
    })

    const advice = all(budgetAdvice(data, M, TODAY)).find((a) => a.id === 'anomaly-Nəqliyyat')
    expect(advice).toBeDefined()
    expect(advice?.fact).toContain('350.00 ₼')
  })

  it('does not flag a month inside the usual variation', () => {
    const data = build({
      transactions: [
        ...steady.map((m, index) => income(m, 1000) && spend(m, 'Nəqliyyat', 140 + index * 10)),
        income(M, 1000),
        spend(M, 'Nəqliyyat', 165),
      ],
    })
    expect(ids(budgetAdvice(data, M, TODAY))).not.toContain('anomaly-Nəqliyyat')
  })

  it('will not run on too little history', () => {
    const data = build({
      transactions: [income(M, 1000), spend(M, 'Nəqliyyat', 999), spend('2026-07', 'Nəqliyyat', 10)],
    })
    const report = budgetAdvice(data, M, TODAY)
    expect(ids(report)).not.toContain('anomaly-Nəqliyyat')
    expect(report.unavailable.some((u) => u.method === 'anomaly')).toBe(true)
  })
})

describe('robust statistics', () => {
  it('takes the median of both odd and even runs', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(median([])).toBe(0)
  })

  it('is not dragged by the outlier it is looking for', () => {
    // The mean of this history is pulled upward by the 900; the median is not.
    const history = [100, 105, 98, 102, 900]
    expect(median(history)).toBe(102)
    expect(robustScore(101, history)).toBeLessThan(2.5)
  })

  it('treats an unprecedented value against a flat history as unbounded', () => {
    // Four identical months have no spread; a fifth at 500 is still the case
    // the rule exists for, so it must not be silently skipped.
    expect(robustScore(500, [100, 100, 100, 100])).toBe(Number.POSITIVE_INFINITY)
    expect(robustScore(100, [100, 100, 100, 100])).toBeNull()
    expect(robustScore(1, [])).toBeNull()
  })
})

describe('zero-based check', () => {
  it('names planned income that has no job', () => {
    const data = build({
      incomePlans: [{ month: M, amounts: { 'Maaş': 1000 } }],
      budgetLines: [line({ planned: 700 })],
    })
    const advice = all(budgetAdvice(data, M, TODAY)).find((a) => a.id === 'zero-based')
    expect(advice?.fact).toContain('300.00 ₼')
    expect(advice?.priority).toBe('review')
  })

  it('flags a plan that spends more than it expects to earn', () => {
    const data = build({
      incomePlans: [{ month: M, amounts: { 'Maaş': 700 } }],
      budgetLines: [line({ planned: 1000 })],
    })
    const advice = all(budgetAdvice(data, M, TODAY)).find((a) => a.id === 'zero-based')
    expect(advice?.priority).toBe('attention')
  })
})

describe('sinking funds', () => {
  it('divides a future planned expense across the months until it', () => {
    const data = build({
      budgetLines: [
        line({ month: '2027-02', description: 'Sığorta', planned: 600 }),
      ],
    })

    const advice = all(budgetAdvice(data, M, TODAY)).find((a) =>
      a.id.startsWith('sinking-'),
    )
    expect(advice?.fact).toContain('600.00 ₼')
    expect(advice?.suggestion).toContain('100.00 ₼') // 600 over six months
  })

  it('ignores past and current months', () => {
    const data = build({ budgetLines: [line({ month: M, planned: 600 })] })
    expect(ids(budgetAdvice(data, M, TODAY)).some((id) => id.startsWith('sinking-'))).toBe(
      false,
    )
  })
})

describe('prioritisation', () => {
  it('caps each bucket at three', () => {
    const months = ['2026-05', '2026-06', '2026-07', '2026-08']
    const categories = ['Ərzaq', 'Nəqliyyat', 'İdman', 'Təhsil', 'Əyləncə']
    const data = build({
      transactions: [
        ...months.flatMap((m) => [
          income(m, 5000),
          ...categories.map((c) => spend(m, c, m === M ? 500 : 100)),
        ]),
      ],
      budgetLines: months.flatMap((m) =>
        categories.map((c) => line({ month: m, category: c, planned: 100 })),
      ),
    })

    const report = budgetAdvice(data, M, TODAY)
    expect(report.attention.length).toBeLessThanOrEqual(3)
    expect(report.good.length).toBeLessThanOrEqual(3)
    expect(report.review.length).toBeLessThanOrEqual(3)
  })

  it('ranks by manat at stake, not by percentage', () => {
    const data = build({
      transactions: [income(M, 5000), spend(M, 'Ərzaq', 700), spend(M, 'İdman', 20)],
      budgetLines: [
        line({ category: 'Ərzaq', planned: 500 }),
        line({ category: 'İdman', planned: 10 }),
      ],
    })

    // İdman is 100% over; Ərzaq is 40% over but by 200 ₼. Between the two
    // category findings, the manat amount decides.
    const report = budgetAdvice(data, M, TODAY)
    const order = report.attention
      .map((a) => a.id)
      .filter((id) => id.startsWith('variance-'))
    expect(order).toEqual(['variance-Ərzaq', 'variance-İdman'])
  })
})

describe('language', () => {
  it('never instructs, only observes or suggests', () => {
    const months = ['2026-05', '2026-06', '2026-07', '2026-08']
    const data = build({
      transactions: [
        ...months.flatMap((m) => [income(m, 1000), spend(m, 'Ərzaq', 400)]),
        spend(M, 'Nəqliyyat', 300),
      ],
      budgetLines: months.map((m) => line({ month: m, planned: 200 })),
      incomePlans: [{ month: M, amounts: { 'Maaş': 1000 } }],
    })

    // The rule is that nothing instructs — not that every suggestion uses one
    // of a handful of approved words, which only constrained the wording.
    const commanding = /məcbur|mütləq|etməlisiniz|olmalısınız|azaltmalı|kəsməlisiniz/i
    for (const advice of all(budgetAdvice(data, M, TODAY))) {
      expect(advice.fact, advice.id).not.toMatch(commanding)
      if (advice.suggestion) expect(advice.suggestion, advice.id).not.toMatch(commanding)
    }
  })
})

describe('one subject per bucket', () => {
  it('keeps only the largest finding for a category', () => {
    // Ərzaq is simultaneously over plan, repeatedly over plan, and unusually
    // high. Three slots spent on one category hide the rest of the month.
    const months = ['2026-05', '2026-06', '2026-07', '2026-08']
    const data = build({
      transactions: [
        ...months.map((m) => income(m, 2000)),
        ...months.map((m) => spend(m, 'Ərzaq', m === M ? 400 : 150)),
        ...months.map((m) => spend(m, 'Nəqliyyat', m === M ? 260 : 40)),
      ],
      budgetLines: months.flatMap((m) => [
        line({ month: m, category: 'Ərzaq', planned: 100 }),
        line({ month: m, category: 'Nəqliyyat', planned: 40 }),
      ]),
    })

    const report = budgetAdvice(data, M, TODAY)
    const subjects = report.attention.map((a) => a.subject)
    expect(new Set(subjects).size).toBe(subjects.length)
    expect(subjects).toContain('Ərzaq')
    expect(subjects).toContain('Nəqliyyat')
  })
})

describe('signed rates', () => {
  it('does not print a negative retained rate as a positive one', () => {
    // A month that overspent has a negative retained rate. Showing it as its
    // magnitude turned the comparison into "16% / 16%", which says nothing.
    const months = ['2026-05', '2026-06', '2026-07']
    const data = build({
      transactions: [
        ...months.map((m) => income(m, 1000)),
        ...months.map((m) => spend(m, 'Ərzaq', 800)),
        income(M, 1000),
        spend(M, 'Ərzaq', 1200),
      ],
    })

    const advice = all(budgetAdvice(data, M, TODAY)).find((a) => a.id === 'retained-trend')
    // Both sides keep their sign, so the two figures cannot read as identical.
    expect(advice?.fact).toContain('-20%')
    expect(advice?.fact).toContain('20%')
    expect(advice?.fact).toMatch(/daha azını saxladınız/)
  })
})
