import { formatAZN } from '../../lib/money'
import { REST_COLOR } from './series'

export interface RingSlice {
  label: string
  value: number
  color: string
  /** Absent for the aggregated "everything else" slice, which cannot drill. */
  category?: string
}

/**
 * Spending against the plan, as one ring.
 *
 * The full circle is whichever is larger — planned or spent — so the drawn
 * arcs are always a true proportion of the same whole. Segments are the
 * ranked categories, in their series colours; whatever is left of the plan
 * stays as empty track. A ring that closes means the plan is used up, and
 * the overspend is drawn in the warning colour rather than merely stated.
 */
export function SpendRing({
  slices,
  spent,
  planned,
  onSelect,
}: {
  slices: RingSlice[]
  spent: number
  planned: number
  onSelect: (category: string) => void
}) {
  const size = 142
  const stroke = 14
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const whole = Math.max(spent, planned, 0.01)
  const over = Math.max(spent - planned, 0)
  const gap = 1.5

  let offset = 0
  const arcs = slices
    .filter((slice) => slice.value > 0)
    .map((slice) => {
      const length = (slice.value / whole) * circumference
      const arc = { ...slice, length: Math.max(length - gap, 0.5), offset }
      offset += length
      return arc
    })

  return (
    <div className="ring-wrap">
      <svg
        className="ring"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${formatAZN(spent)} spent of ${formatAZN(planned)} planned`}
      >
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            className="ring-track"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
          />
          {arcs.map((arc) => (
            <circle
              key={arc.label}
              className="ring-arc"
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${arc.length} ${circumference - arc.length}`}
              strokeDashoffset={-arc.offset}
            />
          ))}
        </g>

        <text
          className="ring-center-label"
          x="50%"
          y="43%"
          textAnchor="middle"
        >
          SPENT
        </text>
        <text className="ring-center-value num" x="50%" y="55%" textAnchor="middle">
          {formatAZN(spent)}
        </text>
        <text className="ring-center-note num" x="50%" y="65%" textAnchor="middle">
          {over > 0 ? `${formatAZN(over)} over plan` : `of ${formatAZN(planned)}`}
        </text>
      </svg>

      <div className="ring-legend">
        {slices.map((slice) => {
          const share = spent > 0 ? Math.round((slice.value / spent) * 100) : 0
          const content = (
            <>
              <span className="swatch" style={{ background: slice.color }} />
              <span className="ring-legend-name">
                {slice.label} · {share}%
              </span>
              <span className="ring-legend-value">{formatAZN(slice.value)}</span>
            </>
          )

          return slice.category ? (
            <button
              type="button"
              className="ring-legend-row"
              key={slice.label}
              onClick={() => onSelect(slice.category as string)}
              title={`${slice.label} · ${formatAZN(slice.value)}`}
            >
              {content}
            </button>
          ) : (
            <span className="ring-legend-row" key={slice.label}>
              {content}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** Top `count` categories in their series colours, plus one aggregated rest. */
export function ringSlices(
  rows: { category: string; actual: number }[],
  colorOf: (category: string) => string,
  count = 3,
): RingSlice[] {
  const named = rows.slice(0, count).map((row) => ({
    label: row.category,
    value: row.actual,
    color: colorOf(row.category),
    category: row.category,
  }))

  const rest = rows.slice(count).reduce((total, row) => total + row.actual, 0)
  return rest > 0
    ? [...named, { label: 'Digərləri', value: rest, color: REST_COLOR }]
    : named
}
