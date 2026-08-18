import { formatAZN } from '../../lib/money'
import type { DayActivity } from '../../lib/analytics'
import type { Transaction } from '../../lib/types'

/**
 * When money moved, across one month.
 *
 * Income rises above the day axis, spending drops below it, and bar length is
 * the amount — so a heavy week is visible as a cluster of long bars rather
 * than as a row of numbers. Clicking a day opens what happened on it.
 */
export function DayStrip({
  days,
  onSelect,
}: {
  days: DayActivity[]
  onSelect: (transactions: Transaction[]) => void
}) {
  const peak = Math.max(...days.flatMap((day) => [day.income, day.expenses]), 0)
  const scale = (value: number) => (peak > 0 ? Math.max((value / peak) * 100, value > 0 ? 6 : 0) : 0)

  return (
    <div className="strip">
      <div className="strip-days">
        {days.map((day) => {
          const active = day.transactions.length > 0
          return (
            <button
              type="button"
              key={day.date}
              className="strip-day"
              disabled={!active}
              onClick={() => onSelect(day.transactions)}
              title={
                active
                  ? `${day.date}${day.income > 0 ? ` · gəlir ${formatAZN(day.income)}` : ''}${
                      day.expenses > 0 ? ` · xərc ${formatAZN(day.expenses)}` : ''
                    }`
                  : `${day.date} · qeyd yoxdur`
              }
            >
              <span className="strip-up">
                <span
                  className="strip-bar income"
                  style={{ height: `${scale(day.income)}%` }}
                />
              </span>
              <span className="strip-axis" />
              <span className="strip-down">
                <span
                  className="strip-bar expense"
                  style={{ height: `${scale(day.expenses)}%` }}
                />
              </span>
            </button>
          )
        })}
      </div>
      <div className="strip-scale">
        <span>1</span>
        <span>{Math.ceil(days.length / 2)}</span>
        <span>{days.length}</span>
      </div>
    </div>
  )
}
