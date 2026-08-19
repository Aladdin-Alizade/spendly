import { describe, expect, it } from 'vitest'
import {
  addPot,
  plannedSavings,
  plannedSavingsRows,
  convertSavingTransactions,
  convertibleSavingTransactions,
  depositedFromIncome,
  depositedFromOutside,
  potBalance,
  potRows,
  removePot,
  renamePot,
  savingsBalance,
  setPotTarget,
  spendableDelta,
  validatePotName,
} from '../savings'
import { knownMonths, spendableBalance, summarise, totalHoldings } from '../calc'
import { fundPace } from '../insights/classification'
import {
  CATEGORY_KINDS,
  SELECTABLE_CATEGORY_KINDS,
  isCategoryKind,
} from '../types'
import type {
  CategoryDef,
  FinanceData,
  SavingsEntry,
  Transaction,
} from '../types'

/**
 * Money set aside still exists. Every test here is a way of asking whether the
 * app still knows that — which is the one thing recording savings as spending
 * got wrong.
 */

const M = '2026-08'

function build(partial: Partial<FinanceData> = {}): FinanceData {
  return {
    transactions: [],
    budgetLines: [],
    incomePlans: [],
    categories: [],
    savingsPots: [{ id: 'p1', name: 'Ehtiyat fondu' }],
    savingsEntries: [],
    savingsPlans: [],
    ...partial,
  }
}

function entry(over: Partial<SavingsEntry> = {}): SavingsEntry {
  return {
    id: 'e1',
    date: '2026-08-05',
    pot: 'Ehtiyat fondu',
    amount: 400,
    direction: 'in',
    source: 'income',
    ...over,
  }
}

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    date: '2026-08-05',
    type: 'expense',
    category: 'Ərzaq',
    description: 'Test',
    amount: 100,
    ...over,
  }
}

describe('balances', () => {
  it('counts a deposit in and a withdrawal out', () => {
    const entries = [
      entry({ id: 'a', amount: 400 }),
      entry({ id: 'b', amount: 150, direction: 'out', source: undefined }),
    ]
    expect(savingsBalance(entries)).toBe(250)
  })

  it('keeps each pot apart', () => {
    const entries = [
      entry({ id: 'a', amount: 400 }),
      entry({ id: 'b', pot: 'Avtomobil', amount: 900 }),
    ]
    expect(potBalance(entries, 'Ehtiyat fondu')).toBe(400)
    expect(potBalance(entries, 'Avtomobil')).toBe(900)
    expect(savingsBalance(entries)).toBe(1300)
  })

  it('stops at the end of the month asked for', () => {
    const entries = [
      entry({ id: 'a', date: '2026-07-20', amount: 200 }),
      entry({ id: 'b', date: '2026-09-02', amount: 500 }),
    ]
    expect(savingsBalance(entries, '2026-08')).toBe(200)
    expect(savingsBalance(entries)).toBe(700)
  })
})

describe('what a movement does to the spendable side', () => {
  it('takes a deposit made out of income off it', () => {
    expect(spendableDelta([entry({ amount: 400, source: 'income' })])).toBe(-400)
  })

  it('leaves it alone for money that arrived from outside', () => {
    // It was never spendable, so putting it in a pot cannot reduce what is.
    expect(spendableDelta([entry({ amount: 400, source: 'external' })])).toBe(0)
  })

  it('puts a withdrawal back', () => {
    expect(
      spendableDelta([entry({ amount: 150, direction: 'out', source: undefined })]),
    ).toBe(150)
  })
})

describe('the three figures the screens report', () => {
  const data = build({
    transactions: [
      tx({ id: 'i1', type: 'income', category: 'Maaş', amount: 2000 }),
      tx({ id: 'x1', amount: 1600 }),
    ],
    savingsEntries: [entry({ id: 'a', amount: 400, source: 'income' })],
  })

  it('sets a deposit aside without calling it spending', () => {
    // 2000 earned, 1600 spent, 400 put away: nothing left to spend, but the
    // 400 is still held.
    expect(spendableBalance(data)).toBe(0)
    expect(savingsBalance(data.savingsEntries)).toBe(400)
    expect(totalHoldings(data)).toBe(400)
  })

  it('grows the total by money that came from outside', () => {
    const withGift = {
      ...data,
      savingsEntries: [
        ...data.savingsEntries,
        entry({ id: 'g', amount: 1000, source: 'external' }),
      ],
    }
    // The gift never passed through income, so only the total moves.
    expect(spendableBalance(withGift)).toBe(0)
    expect(totalHoldings(withGift)).toBe(1400)
  })

  it('returns a withdrawal to the spendable side without inventing income', () => {
    const withdrawn = {
      ...data,
      savingsEntries: [
        ...data.savingsEntries,
        entry({ id: 'w', amount: 250, direction: 'out', source: undefined }),
      ],
    }
    expect(spendableBalance(withdrawn)).toBe(250)
    expect(savingsBalance(withdrawn.savingsEntries)).toBe(150)
    // The household is no richer for having moved its own money.
    expect(totalHoldings(withdrawn)).toBe(400)
  })
})

describe('the month figures', () => {
  const entries = [
    entry({ id: 'a', date: '2026-08-05', amount: 400, source: 'income' }),
    entry({ id: 'b', date: '2026-08-09', amount: 1000, source: 'external' }),
    entry({ id: 'c', date: '2026-07-30', amount: 300, source: 'income' }),
  ]

  it('separates what was set aside from what arrived', () => {
    expect(depositedFromIncome(entries, M)).toBe(400)
    expect(depositedFromOutside(entries, M)).toBe(1000)
  })

  it('leaves other months out', () => {
    expect(depositedFromIncome(entries, '2026-07')).toBe(300)
    expect(depositedFromOutside(entries, '2026-07')).toBe(0)
  })
})

describe('pots', () => {
  it('reports progress only where there is a target', () => {
    const data = build({
      savingsPots: [
        { id: 'p1', name: 'Ehtiyat fondu', target: 3000 },
        { id: 'p2', name: 'Avtomobil' },
      ],
      savingsEntries: [
        entry({ id: 'a', amount: 750 }),
        entry({ id: 'b', pot: 'Avtomobil', amount: 900 }),
      ],
    })

    const rows = potRows(data)
    expect(rows[0].progress).toBeCloseTo(0.25)
    expect(rows[1].progress).toBeNull()
    expect(rows[1].balance).toBe(900)
  })

  it('shows money left behind by a pot that was deleted', () => {
    const data = build({
      savingsPots: [],
      savingsEntries: [entry({ id: 'a', pot: 'Köhnə qab', amount: 500 })],
    })
    const rows = potRows(data)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'Köhnə qab', balance: 500, orphaned: true })
  })

  it('carries every entry across on a rename, without moving a manat', () => {
    const data = build({ savingsEntries: [entry({ id: 'a' })] })
    const renamed = renamePot(data, 'p1', 'Təhlükəsizlik yastığı')
    expect(renamed.savingsEntries[0].pot).toBe('Təhlükəsizlik yastığı')
    expect(savingsBalance(renamed.savingsEntries)).toBe(
      savingsBalance(data.savingsEntries),
    )
  })

  it('refuses to delete a pot that still holds something', () => {
    const data = build({ savingsEntries: [entry({ id: 'a' })] })
    expect(removePot(data, 'p1')).toBe(data)
  })

  it('moves what it holds when a destination is given', () => {
    const data = build({
      savingsPots: [
        { id: 'p1', name: 'Ehtiyat fondu' },
        { id: 'p2', name: 'Avtomobil' },
      ],
      savingsEntries: [entry({ id: 'a', amount: 400 })],
    })
    const removed = removePot(data, 'p1', 'Avtomobil')
    expect(removed.savingsPots.map((pot) => pot.name)).toEqual(['Avtomobil'])
    expect(potBalance(removed.savingsEntries, 'Avtomobil')).toBe(400)
  })

  it('drops an empty pot outright', () => {
    const removed = removePot(build(), 'p1')
    expect(removed.savingsPots).toEqual([])
  })

  it('treats a target of zero as no target at all', () => {
    const data = setPotTarget(build(), 'p1', 0)
    expect(data.savingsPots[0].target).toBeUndefined()
  })

  it('rejects a name that is blank or already taken', () => {
    const data = addPot(build(), { id: 'p2', name: 'Avtomobil' })
    expect(validatePotName(data, '  ')).toBe('Ad yazın')
    expect(validatePotName(data, 'avtomobil')).toBe('Belə qab artıq var')
    expect(validatePotName(data, 'Avtomobil', 'p2')).toBeNull()
    expect(validatePotName(data, 'Təhsil')).toBeNull()
  })
})

describe('converting savings recorded as spending', () => {
  const categories: CategoryDef[] = [
    { id: 'c1', name: 'Yığım', type: 'expense', kind: 'saving' },
    { id: 'c2', name: 'Ərzaq', type: 'expense', kind: 'essential' },
  ]

  const data = build({
    categories,
    savingsPots: [],
    transactions: [
      tx({ id: 's1', category: 'Yığım', amount: 400, description: 'Avqust yığımı' }),
      tx({ id: 's2', category: 'Yığım', amount: 300, date: '2026-07-05' }),
      tx({ id: 'x1', category: 'Ərzaq', amount: 120 }),
    ],
  })

  it('finds them without touching anything', () => {
    const found = convertibleSavingTransactions(data)
    expect(found.transactions).toEqual(['s1', 's2'])
    expect(found.pots).toEqual(['Yığım'])
    expect(found.total).toBe(700)
  })

  it('moves the money across and leaves the spending alone', () => {
    let counter = 0
    const converted = convertSavingTransactions(data, () => `n${(counter += 1)}`)

    expect(converted.transactions.map((t) => t.id)).toEqual(['x1'])
    expect(converted.savingsPots.map((pot) => pot.name)).toEqual(['Yığım'])
    expect(savingsBalance(converted.savingsEntries)).toBe(700)

    // Nothing moved on the spendable side: the money had already left it, and
    // the conversion only changes what the app thinks became of it.
    expect(spendableBalance(converted)).toBe(spendableBalance(data))

    // The total does move, and that is the correction itself. Recorded as
    // spending, the 700 read as consumed; recorded as a deposit, it reads as
    // held — which is what it always was.
    expect(totalHoldings(data)).toBe(-820)
    expect(totalHoldings(converted)).toBe(-120)
  })

  it('does nothing when there is nothing to convert', () => {
    const clean = build({ categories })
    expect(convertSavingTransactions(clean, () => 'x')).toBe(clean)
  })
})

describe('the emergency fund, once there is a balance to measure', () => {
  const data = build({
    categories: [{ id: 'c1', name: 'Ərzaq', type: 'expense', kind: 'essential' }],
    transactions: [
      tx({ id: 'i1', type: 'income', category: 'Maaş', amount: 2000 }),
      tx({ id: 'x1', category: 'Ərzaq', amount: 1000 }),
    ],
    savingsEntries: [entry({ id: 'a', amount: 500, source: 'income' })],
  })

  it('measures the remaining distance, not the whole target', () => {
    const pace = fundPace(data, M, 3000)
    expect(pace).not.toBeNull()
    expect(pace?.saved).toBe(500)
    expect(pace?.remaining).toBe(2500)
    // 500 a month into the pot, 2500 to go.
    expect(pace?.savingMonthly).toBe(500)
    expect(pace?.monthsAtSaving).toBe(5)
  })

  it('reports nothing left to do once the target is met', () => {
    const pace = fundPace(data, M, 400)
    expect(pace?.remaining).toBe(0)
    expect(pace?.monthsAtSaving).toBe(0)
  })
})

describe('the saving category kind, after the pots', () => {
  it('is no longer offered, so one act cannot have two homes', () => {
    expect(SELECTABLE_CATEGORY_KINDS).not.toContain('saving')
    expect(SELECTABLE_CATEGORY_KINDS).toEqual(['essential', 'discretionary', 'debt'])
  })

  it('is still read, so nothing already recorded loses its meaning', () => {
    expect(CATEGORY_KINDS).toContain('saving')
    expect(isCategoryKind('saving')).toBe(true)
  })
})

describe('the planned side', () => {
  const data = build({
    savingsPots: [
      { id: 'p1', name: 'Ehtiyat fondu' },
      { id: 'p2', name: 'Avtomobil' },
    ],
    savingsPlans: [{ month: M, amounts: { 'Ehtiyat fondu': 400, Avtomobil: 200 } }],
    savingsEntries: [
      entry({ id: 'a', amount: 250, source: 'income' }),
      entry({ id: 'b', amount: 1000, source: 'external' }),
    ],
  })

  it('adds the month up across its pots', () => {
    expect(plannedSavings(data.savingsPlans, M)).toBe(600)
    expect(plannedSavings(data.savingsPlans, '2026-07')).toBe(0)
  })

  it('measures the plan against income deposits only', () => {
    const summary = summarise(data, M)
    expect(summary.plannedSavings).toBe(600)
    // The 1,000 came from outside; meeting a plan out of a windfall is not
    // meeting it, so only the 250 counts.
    expect(summary.actualSavings).toBe(250)
  })

  it("leaves the sheet's own remainder untouched", () => {
    // plannedRemainder is C13 − F11 and nothing else, savings plan or not.
    expect(summarise(data, M).plannedRemainder).toBe(0)
  })

  it('keeps a figure planned for a pot that has gone', () => {
    const rows = plannedSavingsRows(
      [{ id: 'p1', name: 'Ehtiyat fondu' }],
      { 'Ehtiyat fondu': 400, 'Köhnə qab': 90 },
    )
    expect(rows).toHaveLength(2)
    expect(rows[1]).toEqual({ pot: 'Köhnə qab', planned: 90, orphaned: true })
  })
})

describe('the months the app knows about', () => {
  it('includes a month whose only record is a savings movement', () => {
    const data = build({
      savingsEntries: [entry({ id: 'a', date: '2026-05-11' })],
    })
    // Without this the entry exists in a month you cannot navigate to.
    expect(knownMonths(data, M)).toContain('2026-05')
  })
})
