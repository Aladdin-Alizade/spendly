import { describe, expect, it } from 'vitest'
import {
  CLASSIFICATION_COVERAGE_MIN,
  classifySpending,
  emergencyFund,
  fiftyThirtyTwenty,
  hasCoverage,
} from '../insights/classification'
import type { CategoryDef, FinanceData, Transaction } from '../types'

const M = '2026-08'

const cats: CategoryDef[] = [
  { id: 'c1', name: 'Ərzaq', type: 'expense', kind: 'essential' },
  { id: 'c2', name: 'Kirayə', type: 'expense', kind: 'essential' },
  { id: 'c3', name: 'Əyləncə', type: 'expense', kind: 'discretionary' },
  { id: 'c4', name: 'Kredit', type: 'expense', kind: 'debt' },
  { id: 'c5', name: 'Yığım', type: 'expense', kind: 'saving' },
  { id: 'c6', name: 'Digər', type: 'expense' },
  { id: 'i1', name: 'Maaş', type: 'income' },
]

let counter = 0
function tx(over: Partial<Transaction> = {}): Transaction {
  counter += 1
  return {
    id: `t${counter}`,
    date: `${M}-10`,
    type: 'expense',
    category: 'Ərzaq',
    description: 'x',
    amount: 100,
    ...over,
  }
}

function build(partial: Partial<FinanceData> = {}): FinanceData {
  return {
    transactions: [],
    budgetLines: [],
    incomePlans: [],
    categories: cats,
    savingsPots: [],
    savingsEntries: [],
    savingsPlans: [],
    ...partial,
  }
}

const income = (month: string, amount: number) =>
  tx({ date: `${month}-01`, type: 'income', category: 'Maaş', amount })

describe('classifySpending', () => {
  it('totals each kind and reports coverage', () => {
    const data = build({
      transactions: [
        tx({ category: 'Ərzaq', amount: 300 }),
        tx({ category: 'Əyləncə', amount: 200 }),
        tx({ category: 'Kredit', amount: 400 }),
        tx({ category: 'Yığım', amount: 100 }),
      ],
    })

    const split = classifySpending(data, M)
    expect(split).toMatchObject({
      essential: 300,
      discretionary: 200,
      debt: 400,
      saving: 100,
      unclassified: 0,
      total: 1000,
    })
    expect(split.coverage).toBe(1)
    expect(hasCoverage(split)).toBe(true)
  })

  it('keeps unclassified spending in the total rather than dropping it', () => {
    // Excluding it from the denominator would make every share look larger
    // than it is.
    const data = build({
      transactions: [tx({ category: 'Ərzaq', amount: 700 }), tx({ category: 'Digər', amount: 300 })],
    })

    const split = classifySpending(data, M)
    expect(split.total).toBe(1000)
    expect(split.unclassified).toBe(300)
    expect(split.coverage).toBeCloseTo(0.7)
    expect(hasCoverage(split)).toBe(false)
    expect(split.missing).toEqual(['Digər'])
  })

  it('names the unclassified categories, largest first', () => {
    const data = build({
      categories: [...cats, { id: 'c7', name: 'Başqa', type: 'expense' }],
      transactions: [tx({ category: 'Digər', amount: 50 }), tx({ category: 'Başqa', amount: 90 })],
    })
    expect(classifySpending(data, M).missing).toEqual(['Başqa', 'Digər'])
  })

  it('ignores income', () => {
    const data = build({ transactions: [income(M, 5000), tx({ amount: 100 })] })
    expect(classifySpending(data, M).total).toBe(100)
  })
})

describe('50/30/20', () => {
  it('maps debt onto needs and counts unspent income as retained', () => {
    const data = build({
      transactions: [
        income(M, 1000),
        tx({ category: 'Ərzaq', amount: 400 }),
        tx({ category: 'Kredit', amount: 100 }),
        tx({ category: 'Əyləncə', amount: 300 }),
      ],
    })

    const framework = fiftyThirtyTwenty(data, M)
    expect(framework).toMatchObject({ needs: 500, wants: 300, savings: 200 })
    expect(framework?.needsShare).toBeCloseTo(0.5)
    expect(framework?.wantsShare).toBeCloseTo(0.3)
    expect(framework?.savingsShare).toBeCloseTo(0.2)
  })

  it('withholds itself when too little spending is classified', () => {
    const data = build({
      transactions: [income(M, 1000), tx({ category: 'Digər', amount: 500 })],
    })
    expect(fiftyThirtyTwenty(data, M)).toBeNull()
  })

  it('withholds itself when there is no income to take a share of', () => {
    const data = build({ transactions: [tx({ category: 'Ərzaq', amount: 500 })] })
    expect(fiftyThirtyTwenty(data, M)).toBeNull()
  })

  it('needs at least the coverage floor, not merely most of it', () => {
    const data = build({
      transactions: [
        income(M, 1000),
        tx({ category: 'Ərzaq', amount: 895 }),
        tx({ category: 'Digər', amount: 105 }),
      ],
    })
    expect(classifySpending(data, M).coverage).toBeLessThan(CLASSIFICATION_COVERAGE_MIN)
    expect(fiftyThirtyTwenty(data, M)).toBeNull()
  })
})

describe('emergency fund', () => {
  const months = ['2026-06', '2026-07', '2026-08']

  it('takes the median of essential spending, not the mean', () => {
    // One unusual month must not set a target you then chase.
    const data = build({
      transactions: [
        ...months.map((m) => income(m, 2000)),
        tx({ date: '2026-06-10', category: 'Ərzaq', amount: 500 }),
        tx({ date: '2026-07-10', category: 'Ərzaq', amount: 520 }),
        tx({ date: '2026-08-10', category: 'Ərzaq', amount: 2000 }),
      ],
    })

    const fund = emergencyFund(data, M, 3)
    expect(fund?.essentialMonthly).toBe(520)
    expect(fund?.target).toBe(1560)
    expect(fund?.sampleMonths).toBe(3)
  })

  it('multiplies by the months the user chose', () => {
    const data = build({
      transactions: months.flatMap((m) => [
        income(m, 2000),
        tx({ date: `${m}-10`, category: 'Ərzaq', amount: 500 }),
      ]),
    })
    expect(emergencyFund(data, M, 3)?.target).toBe(1500)
    expect(emergencyFund(data, M, 6)?.target).toBe(3000)
  })

  it('counts debt payments as essential, since they still have to be met', () => {
    const data = build({
      transactions: months.flatMap((m) => [
        tx({ date: `${m}-10`, category: 'Ərzaq', amount: 300 }),
        tx({ date: `${m}-11`, category: 'Kredit', amount: 200 }),
      ]),
    })
    expect(emergencyFund(data, M, 3)?.essentialMonthly).toBe(500)
  })

  it('will not estimate from fewer than three months', () => {
    const data = build({
      transactions: [tx({ date: '2026-08-10', category: 'Ərzaq', amount: 500 })],
    })
    expect(emergencyFund(data, M, 3)).toBeNull()
  })

  it('skips months it cannot classify rather than understating the figure', () => {
    const data = build({
      transactions: [
        tx({ date: '2026-06-10', category: 'Ərzaq', amount: 500 }),
        tx({ date: '2026-07-10', category: 'Digər', amount: 500 }),
        tx({ date: '2026-08-10', category: 'Ərzaq', amount: 500 }),
      ],
    })
    // Only two usable months remain, which is under the minimum.
    expect(emergencyFund(data, M, 3)).toBeNull()
  })
})
