import { formatAZN } from '../../lib/money'
import type { CategoryRow } from '../../lib/analytics'

/**
 * Planned against actual, per category.
 *
 * The planned amount is a track that actual spend fills, so over and under are
 * read from the shape before any number is read. Spend beyond the plan is drawn
 * in the warning colour and continues past the track — which is what going over
 * budget looks like.
 */
export function PlanBars({
  rows,
  colorOf,
  onSelect,
}: {
  rows: CategoryRow[]
  colorOf: (category: string) => string
  onSelect: (category: string) => void
}) {
  // One scale across all rows, so bar lengths are comparable between them.
  const peak = Math.max(...rows.flatMap((row) => [row.planned, row.actual]), 0)
  const width = (value: number) => (peak > 0 ? `${(value / peak) * 100}%` : '0%')

  return (
    <div className="plan">
      {rows.map((row) => {
        const over = round(row.actual - row.planned)
        const covered = Math.min(row.actual, row.planned)
        const untouched = row.actual === 0 && row.planned > 0

        return (
          <button
            type="button"
            className="plan-row"
            key={row.category}
            onClick={() => onSelect(row.category)}
            style={{ '--series': colorOf(row.category) } as React.CSSProperties}
            title={`${row.category} · planlaşdırılan ${formatAZN(
              row.planned,
            )} məbləğdən ${formatAZN(row.actual)} xərclənib`}
          >
            <span className="plan-name">{row.category}</span>

            <span className="plan-right">
              <span className="plan-figures num">
                {formatAZN(row.actual)}
                <span className="plan-of"> / {formatAZN(row.planned)}</span>
              </span>
              <span className="plan-delta">
                <span
                  className={`pill${over > 0 ? ' pill-neg' : over < 0 ? ' pill-pos' : ''}`}
                >
                  {untouched
                    ? 'istifadə olunmayıb'
                    : over > 0
                      ? `+${formatAZN(over)}`
                      : over < 0
                        ? `−${formatAZN(-over)}`
                        : 'plana uyğun'}
                </span>
              </span>
            </span>

            <span className="plan-track">
              {/* The plan, as a recess the actual spend fills. */}
              <span className="plan-planned" style={{ width: width(row.planned) }} />
              <span className="plan-actual" style={{ width: width(covered) }} />
              {over > 0 && (
                <span
                  className="plan-over"
                  style={{ left: width(row.planned), width: width(over) }}
                />
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
