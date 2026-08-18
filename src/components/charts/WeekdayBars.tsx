import { formatAZN } from '../../lib/money'
import { formatWeekdayShort } from '../../lib/dates'
import type { WeekdayLoad } from '../../lib/analytics'

/**
 * Spending by day of the week.
 *
 * One series, so one hue — the heaviest day is picked out by weight rather
 * than by a second colour, which would imply a second kind of thing. Days with
 * nothing on them keep their column, because an empty Sunday is part of the
 * pattern.
 */
export function WeekdayBars({
  rows,
  onSelect,
}: {
  rows: WeekdayLoad[]
  onSelect: (weekday: number) => void
}) {
  const peak = Math.max(...rows.map((row) => row.expenses), 0)

  return (
    <div className="weekdays">
      {rows.map((row) => {
        const height = peak > 0 ? Math.max((row.expenses / peak) * 100, row.expenses > 0 ? 4 : 0) : 0
        return (
          <button
            type="button"
            className={`weekday${row.expenses === peak && peak > 0 ? ' weekday-peak' : ''}`}
            key={row.weekday}
            disabled={row.count === 0}
            onClick={() => onSelect(row.weekday)}
            title={`${formatWeekdayShort(row.weekday)} · ${formatAZN(row.expenses)} · ${
              row.count
            } əməliyyat`}
          >
            <span className="weekday-plot">
              <span className="weekday-bar" style={{ height: `${height}%` }} />
            </span>
            <span className="weekday-label">{formatWeekdayShort(row.weekday)}</span>
          </button>
        )
      })}
    </div>
  )
}
