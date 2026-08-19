import { useMemo, useState } from 'react'
import { Panel, EmptyState } from '../components/primitives'
import { FlowChart } from '../components/charts/FlowChart'
import { RankedBars } from '../components/charts/RankedBars'
import { PlanBars } from '../components/charts/PlanBars'
import { DayStrip } from '../components/charts/DayStrip'
import { SpendRing, ringSlices } from '../components/charts/SpendRing'
import { categoryColors } from '../components/charts/series'
import { Sparkline } from '../components/charts/Sparkline'
import { WeekdayBars } from '../components/charts/WeekdayBars'
import { IncomeBars } from '../components/charts/IncomeBars'
import { DetailDialog } from '../components/DetailDialog'
import { formatAZN, formatSignedAZN, round2 } from '../lib/money'
import { formatDayShort, formatMonth, formatWeekdayShort, today, weekdayOf } from '../lib/dates'
import { spendableBalance, totalHoldings } from '../lib/calc'
import { depositedFromIncome, savingsBalance } from '../lib/savings'
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
} from '../lib/analytics'
import { PERIODS, comparisonLabel, isSingleMonth, previousPeriod, resolvePeriod } from '../lib/period'
import type { PeriodId } from '../lib/period'
import type { FinanceData, MonthKey, Transaction } from '../lib/types'

/**
 * The dashboard is a grid, read left to right and down:
 *
 *   where I stand · what the plan has left · how money came and went
 *   how it moved over time · what changed
 *   where it went · against the plan
 *   what was unexpected · what recurs
 *   when it happened · the big ones
 *
 * Each panel is shown only when the data can support it, so an empty month is
 * a short page rather than a wall of zeroes, and the grid closes the gap.
 */
export function Dashboard({
  data,
  month,
  onSelectTransaction,
  onAdd,
}: {
  data: FinanceData
  month: MonthKey
  onSelectTransaction: (transaction: Transaction) => void
  onAdd: () => void
}) {
  const [periodId, setPeriodId] = useState<PeriodId>('month')
  const [drill, setDrill] = useState<{ title: string; subtitle?: string; transactions: Transaction[] } | null>(null)

  const period = useMemo(() => resolvePeriod(periodId, month), [periodId, month])

  const view = useMemo(() => {
    const summary = summarisePeriod(data, period)
    const prior = summarisePeriod(data, previousPeriod(period))
    return {
      summary,
      prior,
      balance: spendableBalance(data, period.months.at(-1)),
      priorBalance: spendableBalance(data, previousPeriod(period).months.at(-1)),
      saved: savingsBalance(data.savingsEntries, period.months.at(-1)),
      total: totalHoldings(data, period.months.at(-1)),
      categories: categoryBreakdown(data, period),
      split: expectedSplit(data, period),
      buckets: flowBuckets(data, period),
      facts: insights(data, period),
      largest: largestTransactions(data, period, 5),
      income: incomeSources(data, period),
      weekdays: weekdayPattern(data, period),
      frequent: frequentExpenses(data, period, 5),
      pace: period.months.length === 1 ? spendingPace(data, period.months[0], today()) : null,
      transactions: transactionsInPeriod(data.transactions, period),
      // Movements in this period, and what of them left the spendable side.
      entries: data.savingsEntries.filter((entry) =>
        period.months.includes(entry.date.slice(0, 7)),
      ),
      deposited: round2(
        period.months.reduce(
          (total, item) => total + depositedFromIncome(data.savingsEntries, item),
          0,
        ),
      ),
    }
  }, [data, period])

  const { summary, prior, categories, split, buckets, facts, largest, pace } = view
  const spent = categories.filter((row) => row.actual > 0)
  // Colours come from the ranked breakdown, so a category is the same colour
  // in the ring, the ranking and the plan comparison.
  const colorOf = useMemo(
    () => categoryColors(categories.map((row) => row.category)),
    [categories],
  )
  // A month whose only record is a savings movement is not an empty month:
  // the balance moved, and saying "nothing here" next to that reads as a bug.
  const hasActivity = view.transactions.length > 0 || view.entries.length > 0
  const hasComparison = prior.transactionCount > 0
  const budgetLeft = round2(summary.plannedExpenses - summary.expenses)

  const openWeekday = (weekday: number) => {
    setDrill({
      title: formatWeekdayShort(weekday),
      subtitle: period.label,
      transactions: view.transactions.filter(
        (transaction) =>
          transaction.type === 'expense' && weekdayOf(transaction.date) === weekday,
      ),
    })
  }

  const openCategory = (category: string) => {
    setDrill({
      title: category,
      subtitle: period.label,
      transactions: view.transactions.filter(
        (transaction) =>
          transaction.type === 'expense' && transaction.category === category,
      ),
    })
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">İcmal</h1>
          <p className="page-sub">
            {isSingleMonth(period)
              ? formatMonth(period.months[0])
              : `${formatMonth(period.months[0])} — ${formatMonth(period.months.at(-1) as MonthKey)}`}
            {' · '}
            {view.transactions.length} əməliyyat
            {view.entries.length > 0 && ` · ${view.entries.length} yığım hərəkəti`}
          </p>
        </div>

        <div className="period-picker" role="group" aria-label="Dövr">
          {PERIODS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="period-option"
              aria-pressed={periodId === entry.id}
              onClick={() => setPeriodId(entry.id)}
            >
              <span className="period-long">{entry.label}</span>
              <span className="period-short">{entry.short}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid">
        {/* ---------------------------------------------------------- *
            Where I stand
         * ---------------------------------------------------------- */}
        <Panel
          title="Balans"
          span={4}
          note={
            view.saved > 0 ? (
              <span className="panel-note">xərcləyə bilən</span>
            ) : undefined
          }
        >
          <p className={`hero-value num${view.balance < 0 ? ' neg' : ''}`}>
            {formatAZN(view.balance)}
          </p>

          {/* Money in a pot is money you have, so a balance that excludes it
              needs the rest said next to it or it reads as a loss. */}
          {view.saved > 0 && (
            <p className="hero-aside">
              yığım <strong className="num">{formatAZN(view.saved)}</strong> · cəmi{' '}
              <strong className="num">{formatAZN(view.total)}</strong>
            </p>
          )}

          <div className="hero-meta">
            <Delta
              value={round2(view.balance - view.priorBalance)}
              enabled={hasComparison}
            />
            <span>{comparisonLabel(period)}</span>
          </div>

          {buckets.length > 1 && (
            <div className="hero-spark">
              <Sparkline values={buckets.map((bucket) => bucket.balance)} />
              <p className="hero-foot">
                {isSingleMonth(period)
                  ? 'Ay ərzində balans, həftəlik'
                  : 'Dövr ərzində balans, aylıq'}
              </p>
            </div>
          )}
        </Panel>

        {/* ---------------------------------------------------------- *
            Planda qalan məbləğ
         * ---------------------------------------------------------- */}
        {summary.plannedExpenses > 0 ? (
          <Panel
            title="Büdcə"
            span={4}
            note={
              <span className="panel-note">
                {Math.round((summary.expenses / summary.plannedExpenses) * 100)}% istifadə olunub
              </span>
            }
          >
            <SpendRing
              slices={ringSlices(spent, colorOf)}
              spent={summary.expenses}
              planned={summary.plannedExpenses}
              onSelect={openCategory}
            />
            <div className="ring-foot">
              <span>planlaşdırılan {formatAZN(summary.plannedExpenses)} məbləğdən</span>
              <span className={`ring-foot-value num${budgetLeft < 0 ? ' neg' : ''}`}>
                {formatSignedAZN(budgetLeft)} qalıq
              </span>
            </div>
          </Panel>
        ) : (
          <Panel title="Büdcə" span={4}>
            <EmptyState
              title="Bu dövr üçün plan yoxdur"
              body="Xərcləri planla müqayisə etmək üçün Büdcə səhifəsində planlaşdırılan məbləğləri təyin edin."
            />
          </Panel>
        )}

        {/* ---------------------------------------------------------- *
            How money came and went
         * ---------------------------------------------------------- */}
        <Panel title="Pul dövriyyəsi" span={4}>
          <CashflowRow
            label="Daxil olan"
            value={summary.income}
            max={Math.max(summary.income, summary.expenses)}
            variant="in"
            note={
              hasComparison ? (
                <>
                  <Delta value={round2(summary.income - prior.income)} enabled />{' '}
                  {comparisonLabel(period)}
                </>
              ) : (
                `planlaşdırılan ${formatAZN(summary.plannedIncome)}`
              )
            }
          />
          <CashflowRow
            label="Xərclənən"
            value={summary.expenses}
            max={Math.max(summary.income, summary.expenses)}
            variant="out"
            note={
              summary.plannedExpenses > 0
                ? summary.expenses > summary.plannedExpenses
                  ? `plandan ${formatAZN(summary.expenses - summary.plannedExpenses)} artıq`
                  : `plandan ${formatAZN(summary.plannedExpenses - summary.expenses)} az`
                : `${view.transactions.filter((t) => t.type === 'expense').length} əməliyyat`
            }
          />

          <div className="flow-kept">
            <div>
              <p className="micro">Qalan</p>
              <p
                className={`flow-kept-value num${
                  summary.remainder < 0 ? ' neg' : summary.remainder > 0 ? ' pos' : ''
                }`}
              >
                {formatSignedAZN(summary.remainder)}
              </p>
            </div>
            <span className="pill">
              {summary.savingsRate !== null
                ? `gəlirin ${Math.round(summary.savingsRate * 100)}%-i`
                : 'Gəlir qeydə alınmayıb'}
            </span>
          </div>

          {/* "Qalan" is income minus spending, and a deposit is neither — so
              this figure still holds money the balance above has already moved
              into a pot. Two right answers to two different questions, which
              only confuse each other when nobody says so. */}
          {view.deposited > 0 && (
            <p className="flow-kept-note">
              bunun {formatAZN(view.deposited)} hissəsi yığım qabına keçib —
              balansda yox, qabdadır
            </p>
          )}
        </Panel>

        {!hasActivity && (
          <section className="card col-12">
            <EmptyState
              title={`${
                isSingleMonth(period)
                  ? formatMonth(period.months[0])
                  : period.label.toLowerCase()
              } üçün qeyd yoxdur`}
              body="Gəlir və ya xərcinizi əlavə edin — bu səhifə doldurulacaq."
              action={
                <button type="button" className="button button-primary" onClick={onAdd}>
                  Əməliyyat əlavə et
                </button>
              }
            />
          </section>
        )}

        {/* ---------------------------------------------------------- *
            How money moved
         * ---------------------------------------------------------- */}
        {hasActivity && (
          <Panel
            title="Pul axını"
            span={8}
            note={
              <span className="panel-note">
                {isSingleMonth(period) ? 'həftəlik' : 'aylıq'}
              </span>
            }
          >
            <FlowChart buckets={buckets} />
          </Panel>
        )}

        {/* ---------------------------------------------------------- *
            What changed
         * ---------------------------------------------------------- */}
        {facts.length > 0 && (
          <Panel title="Nə dəyişdi" span={4}>
            <div className="insights">
              {facts.map((fact) => (
                <p className={`insight insight-${fact.tone}`} key={fact.id}>
                  {fact.text}
                </p>
              ))}
            </div>
          </Panel>
        )}

        {/* ---------------------------------------------------------- *
            Pul hara getdi
         * ---------------------------------------------------------- */}
        {spent.length > 0 && (
          <Panel
            title="Pul hara getdi"
            span={4}
            flush
            note={<span className="panel-note">{spent.length} kateqoriya</span>}
          >
            <RankedBars rows={spent} colorOf={colorOf} onSelect={openCategory} />
          </Panel>
        )}

        {/* ---------------------------------------------------------- *
            Against the plan
         * ---------------------------------------------------------- */}
        {summary.plannedExpenses > 0 && (
          <Panel
            title="Plan və faktiki"
            span={8}
            flush
            note={
              <span className="panel-note">
                {formatAZN(summary.expenses)} of {formatAZN(summary.plannedExpenses)}
              </span>
            }
          >
            <PlanBars
              rows={categories.filter((row) => row.planned > 0 || row.actual > 0)}
              colorOf={colorOf}
              onSelect={openCategory}
            />
          </Panel>
        )}

        {/* ---------------------------------------------------------- *
            What came in
         * ---------------------------------------------------------- */}
        {view.income.length > 0 && (
          <Panel
            title="Gəlir mənbələri"
            span={4}
            note={<span className="panel-note">{formatAZN(summary.income)}</span>}
          >
            <IncomeBars rows={view.income} />
          </Panel>
        )}

        {/* ---------------------------------------------------------- *
            What was not in the plan
         * ---------------------------------------------------------- */}
        {summary.expenses > 0 && summary.plannedExpenses > 0 && (
          <Panel title="Gözlənilən və gözlənilməz" span={4}>
            <div className="split-bar">
              <span
                className="split-expected"
                style={{ width: `${(split.expected / summary.expenses) * 100}%` }}
              />
              <span
                className="split-unexpected"
                style={{ width: `${(split.unexpected / summary.expenses) * 100}%` }}
              />
            </div>

            <div className="split-legend">
              <div>
                <p className="split-label">
                  <span
                    className="swatch"
                    style={{ background: 'var(--s1)' }}
                  />
                  Gözlənilən
                </p>
                <p className="split-value num">{formatAZN(split.expected)}</p>
                <p className="split-note">Planla əhatə olunub</p>
              </div>
              <div>
                <p className="split-label">
                  <span
                    className="swatch"
                    style={{ background: 'var(--negative)' }}
                  />
                  Gözlənilməz
                </p>
                <p className={`split-value num${split.unexpected > 0 ? ' neg' : ''}`}>
                  {formatAZN(split.unexpected)}
                </p>
                <p className="split-note">Plandan artıq və ya planlaşdırılmamış</p>
              </div>
            </div>

            {split.items.length > 0 && (
              <ul className="split-items">
                {split.items.slice(0, 4).map((item) => (
                  <li key={`${item.category}-${item.reason}`}>
                    <button type="button" onClick={() => openCategory(item.category)}>
                      <span className="split-item-amount num">{formatAZN(item.amount)}</span>
                      <span className="split-item-text">
                        {item.reason === 'no-plan'
                          ? `${item.category} — bu dövr üçün plan yoxdur`
                          : `${item.category} — planlaşdırılan ${formatAZN(item.planned)} məbləğdən artıq`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        {/* ---------------------------------------------------------- *
            How fast the month is going
         * ---------------------------------------------------------- */}
        {pace !== null && pace.spent > 0 && (
          <Panel
            title="Xərc tempi"
            span={4}
            note={
              <span className="panel-note">
                {pace.elapsed}/{pace.days} gün
              </span>
            }
          >
            <p className="pace-value num">
              {formatAZN(pace.perDay)} <span className="pace-unit">gündə</span>
            </p>
            <p className="pace-note">
              {formatAZN(pace.spent)}
              {pace.complete
                ? ` — ${pace.days} günün ortalaması`
                : ` — ${pace.elapsed} gündə`}
            </p>

            <div className="pace-track">
              <span
                className="pace-elapsed"
                style={{ width: `${(pace.elapsed / pace.days) * 100}%` }}
              />
            </div>

            {pace.planned > 0 && (
              <div className="pace-foot">
                <span className="pace-foot-label">
                  {pace.complete ? 'Ay üzrə cəmi' : 'Bu templə ayın sonuna'}
                </span>
                <span
                  className={`pace-foot-value num${
                    pace.atThisRate > pace.planned ? ' neg' : ' pos'
                  }`}
                >
                  {formatAZN(pace.atThisRate)}
                </span>
                <span className="pace-foot-note">
                  {formatAZN(pace.planned)} planlaşdırılıb
                </span>
              </div>
            )}
          </Panel>
        )}

        {/* ---------------------------------------------------------- *
            When it happened
         * ---------------------------------------------------------- */}
        {hasActivity && isSingleMonth(period) && (
          <Panel
            title="Günlük hərəkət"
            span={8}
            note={<span className="panel-note">{formatMonth(period.months[0])}</span>}
          >
            <DayStrip
              days={dailyActivity(data, period.months[0])}
              onSelect={(transactions) =>
                setDrill({
                  title: formatDayShort(transactions[0].date),
                  subtitle: `${transactions.length} qeyd`,
                  transactions,
                })
              }
            />
          </Panel>
        )}

        {/* ---------------------------------------------------------- *
            Which days carry the spending
         * ---------------------------------------------------------- */}
        {summary.expenses > 0 && (
          <Panel
            title="Həftənin günləri"
            span={4}
            note={<span className="panel-note">xərclər</span>}
          >
            <WeekdayBars rows={view.weekdays} onSelect={openWeekday} />
          </Panel>
        )}

        {/* ---------------------------------------------------------- *
            Recurring commitments — single month only, where "same line as a
            previous month" is a meaningful test.
         * ---------------------------------------------------------- */}
        {isSingleMonth(period) && <RecurringPanel data={data} month={period.months[0]} />}

        {/* ---------------------------------------------------------- *
            What repeats, whether or not the plan named it
         * ---------------------------------------------------------- */}
        {view.frequent.length > 0 && (
          <Panel title="Ən çox təkrarlanan" span={4} flush>
            <div className="rows">
              {view.frequent.map((item) => (
                <button
                  type="button"
                  className="row"
                  key={item.description}
                  onClick={() =>
                    setDrill({
                      title: item.description,
                      subtitle: period.label,
                      transactions: view.transactions.filter(
                        (transaction) =>
                          transaction.type === 'expense' &&
                          transaction.description.trim().toLowerCase() ===
                            item.description.trim().toLowerCase(),
                      ),
                    })
                  }
                >
                  <span className="row-main">
                    <span className="row-title">{item.description}</span>
                    <span className="row-meta">{item.category}</span>
                  </span>
                  <span className="pill">{item.count}&times;</span>
                  <span className="row-amount">−{formatAZN(item.total)}</span>
                </button>
              ))}
            </div>
          </Panel>
        )}

        {/* ---------------------------------------------------------- *
            Biggest single expenses
         * ---------------------------------------------------------- */}
        {largest.length > 0 && (
          <Panel title="Ən böyük xərclər" span={4} flush>
            <div className="rows">
              {largest.map((transaction) => (
                <button
                  type="button"
                  className="row"
                  key={transaction.id}
                  onClick={() => onSelectTransaction(transaction)}
                >
                  <span className="row-date">{formatDayShort(transaction.date)}</span>
                  <span className="row-main">
                    <span className="row-title">{transaction.description}</span>
                    <span className="row-meta">{transaction.category}</span>
                  </span>
                  <span className="row-amount">−{formatAZN(transaction.amount)}</span>
                </button>
              ))}
            </div>
          </Panel>
        )}
        {/* ---------------------------------------------------------- *
            This period against the one before it
         * ---------------------------------------------------------- */}
        {hasComparison && (
          <Panel
            title="Müqayisə"
            span={4}
            note={<span className="panel-note">{comparisonLabel(period)}</span>}
          >
            <div className="compare">
              <CompareRow label="Daxil olan" now={summary.income} before={prior.income} />
              <CompareRow label="Xərclənən" now={summary.expenses} before={prior.expenses} invert />
              <CompareRow label="Qalan" now={summary.remainder} before={prior.remainder} signed />
              <CompareRow
                label="Əməliyyat"
                now={summary.transactionCount}
                before={prior.transactionCount}
                count
              />
            </div>
          </Panel>
        )}

        {/* ---------------------------------------------------------- *
            The plan on its own terms — 'BÜDCƏ İCMALI'!C13, F11 and D4
         * ---------------------------------------------------------- */}
        {(summary.plannedIncome > 0 || summary.plannedExpenses > 0) && (
          <Panel title="Plan" span={4}>
            <div className="compare">
              <div className="compare-row">
                <span className="compare-label">Planlaşdırılan gəlir</span>
                <span className="compare-now num">{formatAZN(summary.plannedIncome)}</span>
              </div>
              <div className="compare-row">
                <span className="compare-label">Planlaşdırılan xərc</span>
                <span className="compare-now num">{formatAZN(summary.plannedExpenses)}</span>
              </div>
              <div className="compare-row compare-total">
                <span className="compare-label">Planlaşdırılan qalıq</span>
                <span
                  className={`compare-now num${summary.plannedRemainder < 0 ? ' neg' : ' pos'}`}
                >
                  {formatSignedAZN(summary.plannedRemainder)}
                </span>
              </div>
            </div>
            <p className="compare-note">
              {summary.plannedRemainder < 0
                ? 'Bu plan qazandığından çoxunu xərcləyir.'
                : 'Plan üzrə gəlir xərcdən çoxdur.'}
              {' '}
              Faktiki fərq: {formatSignedAZN(summary.difference)}.
            </p>
          </Panel>
        )}
      </div>

      {drill && (
        <DetailDialog
          title={drill.title}
          subtitle={drill.subtitle}
          transactions={drill.transactions}
          onSelect={(transaction) => {
            setDrill(null)
            onSelectTransaction(transaction)
          }}
          onClose={() => setDrill(null)}
        />
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */

/** One direction of the period's cashflow: a figure, its share of the larger
 *  side, and one line of context. */
function CashflowRow({
  label,
  value,
  max,
  variant,
  note,
}: {
  label: string
  value: number
  max: number
  variant: 'in' | 'out'
  note: React.ReactNode
}) {
  return (
    <div className="flow-row">
      <div className="flow-row-head">
        <span className="flow-row-label">{label}</span>
        <span className={`flow-row-value num${variant === 'in' ? ' pos' : ''}`}>
          {formatAZN(value)}
        </span>
      </div>
      <div className="bar-track">
        <span
          className={`bar-fill bar-fill-${variant}`}
          style={{ width: max > 0 ? `${(value / max) * 100}%` : '0%' }}
        />
      </div>
      <p className="flow-row-note">{note}</p>
    </div>
  )
}

/** One line of the period-over-period comparison: now, before, and the move
 *  between them. `invert` is for figures where up is the unwelcome direction. */
function CompareRow({
  label,
  now,
  before,
  signed = false,
  invert = false,
  count = false,
}: {
  label: string
  now: number
  before: number
  signed?: boolean
  invert?: boolean
  count?: boolean
}) {
  const move = round2(now - before)
  const format = (value: number) =>
    count ? String(value) : signed ? formatSignedAZN(value) : formatAZN(value)
  const good = invert ? move < 0 : move > 0

  return (
    <div className="compare-row">
      <span className="compare-label">{label}</span>
      <span className="compare-now num">{format(now)}</span>
      <span className="compare-before num">{format(before)}</span>
      <span className="compare-move">
        {move === 0 ? (
          <span className="pill">—</span>
        ) : (
          <span className={`pill ${good ? 'pill-pos' : 'pill-neg'}`}>
            {move > 0 ? '↑' : '↓'} {count ? Math.abs(move) : formatAZN(Math.abs(move))}
          </span>
        )}
      </span>
    </div>
  )
}

/** A change against the comparable previous period, as a pill, or nothing
 *  when there is no earlier data to compare against. */
function Delta({ value, enabled }: { value: number; enabled: boolean }) {
  if (!enabled) return <span className="pill">Əvvəlki məlumat yoxdur</span>
  if (value === 0) return <span className="pill">Unchanged</span>
  return (
    <span className={`pill ${value > 0 ? 'pill-pos' : 'pill-neg'}`}>
      {value > 0 ? '↑' : '↓'} {formatAZN(Math.abs(value))}
    </span>
  )
}

/** Lines the plan carries month to month. Capped, because the point is a
 *  glance at the standing commitments, not a second budget table. */
function RecurringPanel({ data, month }: { data: FinanceData; month: MonthKey }) {
  const RECURRING_SHOWN = 6
  const items = recurringCommitments(data, month).filter((item) => item.planned > 0)
  if (items.length === 0) return null

  const shown = items.slice(0, RECURRING_SHOWN)
  const hidden = items.length - shown.length
  const missing = items.filter((item) => item.matched.length === 0).length

  return (
    <Panel
      title="Təkrarlanan"
      span={8}
      flush
      note={
        <span className="panel-note">
          {missing === 0
            ? 'hamısı əməliyyatla uyğunlaşdı'
            : `${missing} uyğun əməliyyat tapılmadı`}
        </span>
      }
    >
      <div className="rows">
        {shown.map((item) => (
          <div className="recurring-row" key={`${item.description}-${item.category}`}>
            <span className="row-main">
              <span className="row-title">{item.description}</span>
              <span className="row-meta">{item.category}</span>
            </span>
            <span className="recurring-status">
              {item.matched.length > 0 ? (
                <span className="tag tag-done">Qeyd olunub</span>
              ) : (
                <span className="tag">Uyğunluq yoxdur</span>
              )}
            </span>
            <span className="recurring-amount num">
              {item.matched.length > 0 ? formatAZN(item.actual) : '—'}
              <span className="plan-of"> / {formatAZN(item.planned)}</span>
            </span>
          </div>
        ))}
        {hidden > 0 && (
          <p className="rows-more">
            büdcədə daha {hidden} təkrarlanan sətir
          </p>
        )}
      </div>
    </Panel>
  )
}
