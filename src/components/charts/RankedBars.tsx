import { formatAZN } from '../../lib/money'
import type { CategoryRow } from '../../lib/analytics'

/**
 * Ranked spending by category. A horizontal bar per category, because ranking
 * is what matters here and a donut makes ten similar slices hard to order —
 * the ring above answers "how much of the plan", this answers "in what order".
 *
 * Bar colour is the category's rank, matching the ring's segments, so the same
 * category is the same colour wherever it appears on the page.
 */
export function RankedBars({
  rows,
  colorOf,
  onSelect,
}: {
  rows: CategoryRow[]
  colorOf: (category: string) => string
  onSelect: (category: string) => void
}) {
  const peak = Math.max(...rows.map((row) => row.actual), 0)

  return (
    <div className="ranked">
      {rows.map((row) => {
        const moved =
          row.changeRatio !== null && Math.abs(row.changeRatio) >= 0.01
            ? row.changeRatio
            : null

        return (
          <button
            type="button"
            className="ranked-row"
            key={row.category}
            onClick={() => onSelect(row.category)}
            style={{ '--series': colorOf(row.category) } as React.CSSProperties}
            title={`${row.category} · ${formatAZN(row.actual)}`}
          >
            <span className="swatch" style={{ background: colorOf(row.category) }} />
            <span className="ranked-name">{row.category}</span>
            <span className="ranked-amount num">{formatAZN(row.actual)}</span>

            <span className="ranked-track">
              <span
                className={`ranked-fill${row.unplanned ? ' unplanned' : ''}`}
                style={{ width: peak > 0 ? `${(row.actual / peak) * 100}%` : '0%' }}
              />
            </span>

            <span className="ranked-meta">
              <span>{Math.round(row.share * 100)}% xərclərin payı</span>
              {moved !== null && (
                <span className={`ranked-change ${moved > 0 ? 'neg' : 'pos'}`}>
                  {moved > 0 ? '↑' : '↓'}
                  {Math.round(Math.abs(moved) * 100)}%
                </span>
              )}
              {row.unplanned && <span>planlaşdırılmayıb</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
