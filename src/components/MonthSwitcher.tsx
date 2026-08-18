import { formatMonth, shiftMonth } from '../lib/dates'
import type { MonthKey } from '../lib/types'

/**
 * Replaces the spreadsheet's one-file-per-month workflow. Any month can be
 * reached, including ones with no data yet, so a new month can be planned early.
 */
export function MonthSwitcher({
  month,
  months,
  onChange,
}: {
  month: MonthKey
  months: MonthKey[]
  onChange: (month: MonthKey) => void
}) {
  // The selected month must always be present, or the <select> would fall back
  // to showing whichever option happens to come first. One month either side is
  // offered too, so a new month can be reached without leaving the control.
  const options = [
    ...new Set([month, ...months, shiftMonth(month, -1), shiftMonth(month, 1)]),
  ]
    .sort()
    .reverse()

  return (
    <div className="month-switch">
      <button
        type="button"
        className="icon-button"
        aria-label="Əvvəlki ay"
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <Chevron direction="left" />
      </button>
      <select
        value={month}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Ay"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {formatMonth(option)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="icon-button"
        aria-label="Növbəti ay"
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <Chevron direction="right" />
      </button>
    </div>
  )
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M10 3 5 8l5 5' : 'M6 3l5 5-5 5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
