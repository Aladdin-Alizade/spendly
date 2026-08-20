/**
 * The advice engine.
 *
 * Every sentence on the Məsləhətlər screen is produced here, by a rule that
 * either fires or does not. There is no model in the loop and nothing is
 * generated: given the same figures the output is the same, every time, which
 * is what makes it testable.
 *
 * Three kinds of statement are kept apart on purpose:
 *   fact       — arithmetic on the user's own numbers
 *   suggestion — something worth looking at, phrased as a suggestion
 *   framework  — a published reference, named and sourced where used
 *
 * A rule that cannot be supported by the data stays silent, and says why in
 * `unavailable` rather than lowering its own standard.
 */

import { round2, sum } from '../money'
import { formatAZN } from '../money'
import { monthOf, shiftMonth, formatMonth } from '../dates'
import { plannedIncomeOf } from '../types'
import { actualExpenses, actualIncome, plannedExpenses } from '../calc'
import { THRESHOLDS } from './thresholds'
import type { MethodId } from './methodology'
import type { DateKey, FinanceData, MonthKey } from '../types'

export type AdvicePriority = 'attention' | 'good' | 'review'

export interface AdviceMeter {
  /** Primary quantity, 0..1 of the bar. */
  value: number
  /** Optional reference mark, 0..1. */
  reference?: number
  label: string
}

export interface Advice {
  id: string
  priority: AdvicePriority
  method: MethodId
  /** Arithmetic on the user's numbers. Never a judgement. */
  fact: string
  /** Phrased as something to consider, never as an instruction. */
  suggestion?: string
  /** Manat at stake, used to rank. A 40% overrun on 5 ₼ must not outrank 200 ₼. */
  materiality: number
  /**
   * What the advice is about, usually a category. A bucket holds three
   * entries, and three findings about one category crowd out everything else
   * the month had to say — so only the largest per subject is kept.
   */
  subject?: string
  meter?: AdviceMeter
}

export interface BudgetHealth {
  income: number
  expenses: number
  remaining: number
  /** Share of income not spent. Null when nothing came in. */
  retainedRate: number | null
  /** Share of income spent. Null when nothing came in. */
  spendingRatio: number | null
  plannedExpenses: number
  plannedIncome: number
  /** actual − planned. Null when there is no plan. */
  planVariance: number | null
}

export interface Unavailable {
  method: MethodId
  reason: string
}

export interface AdviceReport {
  month: MonthKey
  health: BudgetHealth
  attention: Advice[]
  good: Advice[]
  review: Advice[]
  /** Rules that stayed silent, and what they were missing. */
  unavailable: Unavailable[]
}

/** At most this many per bucket, so the screen stays readable. */
const PER_BUCKET = 3

export function budgetAdvice(
  data: FinanceData,
  month: MonthKey,
  asOf: DateKey,
): AdviceReport {
  const income = actualIncome(data.transactions, month)
  const expenses = actualExpenses(data.transactions, month)
  const planned = plannedExpenses(data.budgetLines, month)
  const plan = data.incomePlans.find((entry) => entry.month === month)
  const plannedIn = round2(plannedIncomeOf(plan))

  const health: BudgetHealth = {
    income,
    expenses,
    remaining: round2(income - expenses),
    retainedRate: income > 0 ? (income - expenses) / income : null,
    spendingRatio: income > 0 ? expenses / income : null,
    plannedExpenses: planned,
    plannedIncome: plannedIn,
    planVariance: planned > 0 ? round2(expenses - planned) : null,
  }

  const found: Advice[] = []
  const unavailable: Unavailable[] = []

  for (const rule of RULES) {
    rule({ data, month, asOf, health, add: (a) => found.push(a), skip: (u) => unavailable.push(u) })
  }

  const bucket = (priority: AdvicePriority) => {
    const seen = new Set<string>()
    return found
      .filter((entry) => entry.priority === priority)
      .sort((a, b) => b.materiality - a.materiality)
      .filter((entry) => {
        if (entry.subject === undefined) return true
        if (seen.has(entry.subject)) return false
        seen.add(entry.subject)
        return true
      })
      .slice(0, PER_BUCKET)
  }

  return {
    month,
    health,
    attention: bucket('attention'),
    good: bucket('good'),
    review: bucket('review'),
    unavailable,
  }
}

/* ------------------------------------------------------------------ *
 * Rules
 * ------------------------------------------------------------------ */

interface Context {
  data: FinanceData
  month: MonthKey
  asOf: DateKey
  health: BudgetHealth
  add(advice: Advice): void
  skip(entry: Unavailable): void
}

type Rule = (context: Context) => void

/** Magnitude only — for "X% higher", where the direction is in the words. */
const percent = (ratio: number) => `${Math.round(Math.abs(ratio) * 100)}%`

/** Keeps the sign, for a rate that can genuinely be negative. A retained rate
 *  of −16% shown as 16% turns the sentence into nonsense. */
const signed = (ratio: number) => `${Math.round(ratio * 100)}%`


/* --- what the month looks like against income --------------------- */

/**
 * The month did not pay for itself.
 *
 * This was two rules — one for the ratio, one for the shortfall — which put
 * two sentences about the same fact in the same bucket of three.
 */
const overspent: Rule = ({ health, add, skip }) => {
  if (health.spendingRatio === null) {
    skip({ method: 'spending-ratio', reason: 'Nisbəti çıxarmaq üçün gəlir lazımdır' })
    return
  }
  if (health.remaining >= 0) return

  add({
    id: 'overspent',
    method: 'spending-ratio',
    priority: 'attention',
    fact: `Bu ay gəlirinizdən ${formatAZN(-health.remaining)} çox xərclədiniz — qazandığınız hər 100 manata qarşı ${Math.round(health.spendingRatio * 100)} manat.`,
    suggestion:
      'Fərqin hansı kateqoriyalardan gəldiyinə baxmağa dəyər — aşağıdakı siyahı ən böyükdən başlayır.',
    materiality: Math.abs(health.remaining),
  })
}

const retainedTrend: Rule = ({ data, month, health, add, skip }) => {
  const months = previousMonths(month, 3)
  const series = months
    .map((m) => ({ m, income: actualIncome(data.transactions, m) }))
    .filter((entry) => entry.income > 0)

  if (series.length === 0 || health.retainedRate === null) {
    skip({ method: 'retained', reason: 'Müqayisə üçün əvvəlki aylarda gəlir yoxdur' })
    return
  }

  const rates = series.map(({ m, income }) => (income - actualExpenses(data.transactions, m)) / income)
  const average = rates.reduce((total, rate) => total + rate, 0) / rates.length
  const gap = health.retainedRate - average
  if (Math.abs(gap) < THRESHOLDS.materialRatio.value) return

  add({
    id: 'retained-trend',
    method: 'retained',
    priority: gap > 0 ? 'good' : 'review',
    fact:
      // Either rate can be negative, so both keep their sign.
      gap > 0
        ? `Bu ay gəlirinizin ${signed(health.retainedRate)}-i qaldı — son ${rates.length} ayda orta hesabla ${signed(average)} qalırdı. Yəni bu ay daha çoxunu saxladınız.`
        : `Bu ay gəlirinizin ${signed(health.retainedRate)}-i qaldı — son ${rates.length} ayda orta hesabla ${signed(average)} qalırdı. Yəni bu ay daha azını saxladınız.`,
    suggestion:
      gap < 0
        ? 'Səbəb ya gəlirin azalması, ya da xərcin artmasıdır — hansı olduğuna baxmağa dəyər.'
        : undefined,
    materiality: Math.abs(gap) * health.income,
  })
}

/* --- against the plan --------------------------------------------- */

const totalVariance: Rule = ({ health, add, skip }) => {
  if (health.planVariance === null) {
    skip({ method: 'variance', reason: 'Bu ay üçün xərc planı qurulmayıb' })
    return
  }

  const variance = health.planVariance
  if (Math.abs(variance) < THRESHOLDS.materialAmount.value) return

  const ratio = variance / health.plannedExpenses
  if (Math.abs(ratio) < THRESHOLDS.materialRatio.value) return

  add({
    id: 'total-variance',
    method: 'variance',
    priority: variance > 0 ? 'attention' : 'good',
    fact:
      variance > 0
        ? `Bu ay ${formatAZN(health.expenses)} xərclədiniz — planladığınızdan ${formatAZN(variance)} çox.`
        : `Bu ay ${formatAZN(health.expenses)} xərclədiniz — planladığınızdan ${formatAZN(-variance)} az.`,
    materiality: Math.abs(variance),
    meter: {
      value: Math.min(health.expenses / health.plannedExpenses, 1),
      reference: 1,
      label: `plan ${formatAZN(health.plannedExpenses)}`,
    },
  })
}

const categoryVariance: Rule = ({ data, month, add }) => {
  for (const row of categoryRows(data, month)) {
    if (row.planned <= 0) continue
    const variance = round2(row.actual - row.planned)
    if (Math.abs(variance) < THRESHOLDS.materialAmount.value) continue
    const ratio = variance / row.planned
    if (Math.abs(ratio) < THRESHOLDS.materialRatio.value) continue

    add({
      id: `variance-${row.category}`,
      method: 'variance',
      priority: variance > 0 ? 'attention' : 'good',
      fact:
        variance > 0
          ? `${row.category} üçün ${formatAZN(row.planned)} planlamışdınız — ${formatAZN(row.actual)} getdi, ${formatAZN(variance)} çox.`
          : `${row.category} üçün ${formatAZN(row.planned)} planlamışdınız — ${formatAZN(row.actual)} getdi, ${formatAZN(-variance)} qənaət.`,
      materiality: Math.abs(variance),
      subject: row.category,
      meter: {
        value: Math.min(row.actual / row.planned, 1),
        reference: 1,
        label: `plan ${formatAZN(row.planned)}`,
      },
    })
  }
}

const repeatedOverrun: Rule = ({ data, month, add, skip }) => {
  const window = THRESHOLDS.repeatedWindow.value
  const months = [...previousMonths(month, window - 1), month]
  const planned = months.filter((m) => plannedExpenses(data.budgetLines, m) > 0)

  if (planned.length < window) {
    skip({
      method: 'variance',
      reason: `Təkrarlanan aşım üçün ${window} ayın planı lazımdır (hazırda ${planned.length})`,
    })
    return
  }

  const categories = new Set(data.budgetLines.filter((l) => months.includes(l.month)).map((l) => l.category))

  for (const category of categories) {
    const over = months.filter((m) => {
      const plan = plannedFor(data, m, category)
      return plan > 0 && actualFor(data, m, category) > plan
    })

    if (over.length < THRESHOLDS.repeatedOverruns.value) continue

    const excess = sum(
      over.map((m) => actualFor(data, m, category) - plannedFor(data, m, category)),
    )

    add({
      id: `repeated-${category}`,
      method: 'variance',
      priority: 'attention',
      fact: `${category} son ${window} ayın ${over.length}-ində planı aşıb — bu aylarda cəmi ${formatAZN(excess)} artıq gedib.`,
      suggestion:
        'Bir dəfə aşmaq təsadüf ola bilər; hər ay aşmaq adətən plan məbləğinin real olmadığını göstərir. Ya xərcə, ya plana baxmağa dəyər.',
      materiality: excess,
      subject: category,
    })
  }
}

/* --- statistics over history -------------------------------------- */

const anomaly: Rule = ({ data, month, add, skip }) => {
  const need = THRESHOLDS.anomalyMinMonths.value
  const baselineMonths = previousMonths(month, need + 2)
  const withData = baselineMonths.filter((m) => actualExpenses(data.transactions, m) > 0)

  if (withData.length < need) {
    skip({
      method: 'anomaly',
      reason: `Qeyri-adi xərc üçün ən azı ${need} aylıq tarixçə lazımdır (hazırda ${withData.length})`,
    })
    return
  }

  for (const row of categoryRows(data, month)) {
    if (row.actual <= 0) continue
    const history = withData.map((m) => actualFor(data, m, row.category))
    const score = robustScore(row.actual, history)
    if (score === null || score <= THRESHOLDS.anomalyScore.value) continue

    const typical = median(history)
    const difference = round2(row.actual - typical)
    if (Math.abs(difference) < THRESHOLDS.materialAmount.value) continue

    add({
      id: `anomaly-${row.category}`,
      method: 'anomaly',
      priority: difference > 0 ? 'attention' : 'review',
      fact: `${row.category} üçün adətən ayda ${formatAZN(typical)} çıxır — bu ay ${formatAZN(row.actual)} çıxdı, ${formatAZN(Math.abs(difference))} fərqlə.`,
      suggestion:
        difference > 0
          ? 'Birdəfəlik bir xərc olubsa, gözlənilən haldır. Deyilsə, növbəti aylarda da təkrarlanacaq.'
          : undefined,
      materiality: Math.abs(difference),
      subject: row.category,
    })
  }
}

const trend: Rule = ({ data, month, add, skip }) => {
  const baseline = previousMonths(month, 3).filter(
    (m) => actualExpenses(data.transactions, m) > 0,
  )

  if (baseline.length < THRESHOLDS.trendMinMonths.value - 1) {
    skip({
      method: 'trend',
      reason: `Trend üçün əvvəlki 3 ayın məlumatı lazımdır (hazırda ${baseline.length})`,
    })
    return
  }

  for (const row of categoryRows(data, month)) {
    const history = baseline.map((m) => actualFor(data, m, row.category))
    const average = history.reduce((total, value) => total + value, 0) / history.length
    if (average < THRESHOLDS.materialAmount.value) continue

    const ratio = (row.actual - average) / average
    if (Math.abs(ratio) < THRESHOLDS.trendRatio.value) continue

    const difference = round2(row.actual - average)
    if (Math.abs(difference) < THRESHOLDS.materialAmount.value) continue

    add({
      id: `trend-${row.category}`,
      method: 'trend',
      priority: ratio > 0 ? 'review' : 'good',
      fact:
        ratio > 0
          ? `${row.category} son 3 ayda orta hesabla ${formatAZN(round2(average))} olub — bu ay ${formatAZN(row.actual)}, ${percent(ratio)} çox.`
          : `${row.category} son 3 ayda orta hesabla ${formatAZN(round2(average))} olub — bu ay ${formatAZN(row.actual)}, ${percent(ratio)} az.`,
      materiality: Math.abs(difference),
      subject: row.category,
    })
  }
}

const lifestyle: Rule = ({ data, month, add, skip }) => {
  const need = THRESHOLDS.lifestyleMinMonths.value
  const months = [...previousMonths(month, need - 1), month]
  const active = months.filter((m) => actualIncome(data.transactions, m) > 0)

  if (active.length < need) {
    skip({
      method: 'lifestyle',
      reason: `Müqayisə üçün ${need} aylıq tarixçə lazımdır (hazırda ${active.length})`,
    })
    return
  }

  const recent = months.slice(-3)
  const earlier = months.slice(0, 3)
  const mean = (list: MonthKey[], pick: (m: MonthKey) => number) =>
    list.reduce((total, m) => total + pick(m), 0) / list.length

  const expenseBefore = mean(earlier, (m) => actualExpenses(data.transactions, m))
  const expenseNow = mean(recent, (m) => actualExpenses(data.transactions, m))
  const incomeBefore = mean(earlier, (m) => actualIncome(data.transactions, m))
  const incomeNow = mean(recent, (m) => actualIncome(data.transactions, m))

  if (expenseBefore <= 0 || incomeBefore <= 0) return

  const expenseGrowth = (expenseNow - expenseBefore) / expenseBefore
  const incomeGrowth = (incomeNow - incomeBefore) / incomeBefore
  const gap = expenseGrowth - incomeGrowth
  if (gap < THRESHOLDS.lifestyleGap.value) return

  add({
    id: 'lifestyle',
    method: 'lifestyle',
    priority: 'review',
    fact: `Xərcləriniz gəlirinizdən sürətlə artır — son 3 ayda xərc ${percent(expenseGrowth)}, gəlir isə ${percent(incomeGrowth)} artıb.`,
    suggestion:
      'Gəlir artanda xərcin artması adi haldır, amma bu templə fərq açılır. Artımın hansı kateqoriyalardan gəldiyinə baxmağa dəyər.',
    materiality: round2(expenseNow - expenseBefore),
  })
}

/* --- composition of the month ------------------------------------- */

const concentration: Rule = ({ data, month, health, add }) => {
  if (health.expenses <= 0) return
  const rows = categoryRows(data, month)
    .filter((row) => row.actual > 0)
    .sort((a, b) => b.actual - a.actual)
  const top = rows[0]
  if (!top) return

  const share = top.actual / health.expenses
  if (share < THRESHOLDS.concentrationShare.value) return

  add({
    id: 'concentration',
    method: 'concentration',
    priority: 'review',
    fact: `Xərclədiyiniz hər 100 manatın ${Math.round(share * 100)} manatı ${top.category} kateqoriyasına gedir — bu ay ${formatAZN(top.actual)}.`,
    materiality: top.actual,
    subject: top.category,
    meter: { value: share, label: 'ümumi xərcdəki payı' },
  })
}

const unexpected: Rule = ({ data, month, health, add, skip }) => {
  if (health.plannedExpenses <= 0 || health.expenses <= 0) {
    skip({ method: 'unexpected', reason: 'Bu ay üçün plan və ya xərc yoxdur' })
    return
  }

  const beyond = categoryRows(data, month).reduce(
    (total, row) => total + Math.max(row.actual - row.planned, 0),
    0,
  )
  const share = beyond / health.expenses
  if (share < THRESHOLDS.unexpectedShare.value) return

  add({
    id: 'unexpected',
    method: 'unexpected',
    priority: 'review',
    fact: `${formatAZN(round2(beyond))} planda nəzərdə tutulmamış xərcdir — bu ayın xərcinin ${percent(share)}-i.`,
    materiality: round2(beyond),
    meter: { value: share, label: 'plandan kənar hissə' },
  })
}

const recurringBurden: Rule = ({ data, month, health, add, skip }) => {
  if (health.income <= 0) {
    skip({ method: 'recurring', reason: 'Öhdəliklərin payı üçün gəlir lazımdır' })
    return
  }

  const previous = shiftMonth(month, -1)
  const earlier = new Set(
    data.budgetLines
      .filter((line) => line.month === previous)
      .map((line) => normalise(line.description)),
  )
  const recurring = data.budgetLines.filter(
    (line) => line.month === month && line.planned > 0 && earlier.has(normalise(line.description)),
  )
  if (recurring.length === 0) return

  const total = sum(recurring.map((line) => line.planned))
  const share = total / health.income
  if (share < THRESHOLDS.recurringShare.value) return

  add({
    id: 'recurring',
    method: 'recurring',
    priority: 'review',
    fact: `Gəlirinizin ${percent(share)}-i hər ay təkrarlanan öhdəliklərə bağlıdır — ${recurring.length} sətir, ${formatAZN(total)}. Sərbəst qalan hissə ${percent(1 - share)}-dir.`,
    materiality: total,
    meter: { value: Math.min(share, 1), label: 'gəlirdəki payı' },
  })
}

/* --- the plan on its own terms ------------------------------------ */

const zeroBased: Rule = ({ health, add, skip }) => {
  if (health.plannedIncome <= 0) {
    skip({ method: 'zero-based', reason: 'Planlaşdırılan gəlir qeyd edilməyib' })
    return
  }

  const unallocated = round2(health.plannedIncome - health.plannedExpenses)
  if (Math.abs(unallocated) < THRESHOLDS.materialAmount.value) {
    add({
      id: 'zero-based',
      method: 'zero-based',
      priority: 'good',
      fact: `Planlaşdırdığınız gəlirin demək olar hamısının təyinatı var — yersiz qalan cəmi ${formatAZN(Math.abs(unallocated))}.`,
      materiality: Math.abs(unallocated),
    })
    return
  }

  add({
    id: 'zero-based',
    method: 'zero-based',
    priority: unallocated < 0 ? 'attention' : 'review',
    fact:
      unallocated < 0
        ? `Planınızın özü kəsirlidir: gözlədiyiniz gəlirdən ${formatAZN(-unallocated)} çox xərcləməyi nəzərdə tutur.`
        : `Planlaşdırdığınız gəlirin ${formatAZN(unallocated)}-i planda heç bir yerə yazılmayıb — nə xərcə, nə yığıma.`,
    suggestion:
      unallocated > 0
        ? 'Bu məbləğə bir ad vermək — yığım, gələcək xərc, nə olursa — onun harada qaldığını izləməyi asanlaşdırır.'
        : undefined,
    materiality: Math.abs(unallocated),
  })
}

const sinkingFunds: Rule = ({ data, month, add, skip }) => {
  const future = data.budgetLines.filter((line) => line.month > month && line.planned > 0)
  if (future.length === 0) {
    skip({
      method: 'sinking-fund',
      reason: 'Gələcək aylara planlaşdırılmış xərc yoxdur',
    })
    return
  }

  for (const line of future) {
    const away = monthsBetween(month, line.month)
    if (away <= 0) continue
    const perMonth = round2(line.planned / away)
    if (perMonth < THRESHOLDS.materialAmount.value) continue

    add({
      id: `sinking-${line.id}`,
      method: 'sinking-fund',
      priority: 'review',
      fact: `${away} ay sonra, ${formatMonth(line.month)} ayında ${formatAZN(line.planned)} lazım olacaq: ${line.description}.`,
      suggestion: `Bu, ayda ${formatAZN(perMonth)} deməkdir. İndidən kənara qoysanız, həmin ay büdcənizə birdən düşməz.`,
      materiality: line.planned,
    })
  }
}

const RULES: Rule[] = [
  overspent,
  retainedTrend,
  totalVariance,
  categoryVariance,
  repeatedOverrun,
  anomaly,
  trend,
  lifestyle,
  concentration,
  unexpected,
  recurringBurden,
  zeroBased,
  sinkingFunds,
]

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

interface CategoryRow {
  category: string
  actual: number
  planned: number
}

function categoryRows(data: FinanceData, month: MonthKey): CategoryRow[] {
  const names = new Set<string>()
  for (const transaction of data.transactions) {
    if (transaction.type === 'expense' && monthOf(transaction.date) === month) {
      names.add(transaction.category)
    }
  }
  for (const line of data.budgetLines) {
    if (line.month === month) names.add(line.category)
  }

  return [...names].map((category) => ({
    category,
    actual: actualFor(data, month, category),
    planned: plannedFor(data, month, category),
  }))
}

function actualFor(data: FinanceData, month: MonthKey, category: string): number {
  return sum(
    data.transactions
      .filter(
        (t) =>
          t.type === 'expense' && t.category === category && monthOf(t.date) === month,
      )
      .map((t) => t.amount),
  )
}

function plannedFor(data: FinanceData, month: MonthKey, category: string): number {
  return sum(
    data.budgetLines
      .filter((line) => line.month === month && line.category === category)
      .map((line) => line.planned),
  )
}

/** `count` months immediately before `month`, oldest first. */
function previousMonths(month: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, index) => shiftMonth(month, index - count))
}

function monthsBetween(from: MonthKey, to: MonthKey): number {
  const key = (m: MonthKey) => {
    const [year, index] = m.split('-').map(Number)
    return year * 12 + (index - 1)
  }
  return key(to) - key(from)
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

/**
 * Distance from the median in robust units.
 *
 * `1.4826` scales the median absolute deviation so that, for normally
 * distributed data, it estimates the same spread the standard deviation would
 * — which is what makes a cutoff of 2.5 comparable to the familiar one.
 *
 * A history that never varied has a spread of zero, which leaves the ratio
 * undefined. Declining to judge it would hide exactly the case the rule is
 * for — four months at 150 and then 350 — so an unprecedented value scores as
 * unbounded, and the caller's materiality floor is what keeps a 20 qəpik
 * wobble off the screen.
 */
export function robustScore(value: number, history: number[]): number | null {
  if (history.length === 0) return null
  const centre = median(history)
  const deviation = median(history.map((entry) => Math.abs(entry - centre)))
  if (deviation === 0) return value === centre ? null : Number.POSITIVE_INFINITY
  return Math.abs(value - centre) / (1.4826 * deviation)
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}
