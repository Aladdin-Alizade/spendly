import { formatAZN } from '../../lib/money'
import type { FlowBucket } from '../../lib/analytics'

/**
 * Money in, money out, and the balance that results — one picture.
 *
 * Bars compare income against expenses per bucket; the overlaid line is the
 * running balance, so the chart also answers "how did I get from the start of
 * the period to where I am now" without needing a second visual.
 *
 * Bars are laid out with CSS and only the line is SVG: a stretched viewBox
 * would distort circular markers, and this keeps the bars pixel-crisp at any
 * width without a chart library.
 */
export function FlowChart({ buckets }: { buckets: FlowBucket[] }) {
  const peak = Math.max(...buckets.flatMap((b) => [b.income, b.expenses]), 0)
  const balances = buckets.map((b) => b.balance)
  const balanceMax = Math.max(...balances, 0)
  const balanceMin = Math.min(...balances, 0)
  const balanceRange = balanceMax - balanceMin || 1

  const height = (value: number) => (peak > 0 ? `${(value / peak) * 100}%` : '0%')

  // 0 at the bottom of the plot, 100 at the top, in SVG user units.
  const points = buckets.map((bucket, index) => {
    const x = ((index + 0.5) / buckets.length) * 100
    const y = 100 - ((bucket.balance - balanceMin) / balanceRange) * 100
    return { x, y }
  })

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
    .join(' ')

  const showLine = buckets.length > 1 && balances.some((value) => value !== 0)

  return (
    <div className="chart">
      <div className="chart-plot">
        {showLine && (
          <svg
            className="chart-overlay"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d={linePath}
              className="chart-line"
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}

        <div className="chart-bars">
          {buckets.map((bucket) => (
            <div
              className="chart-slot"
              key={bucket.key}
              title={`${bucket.label} · gəlir ${formatAZN(bucket.income)} · xərc ${formatAZN(
                bucket.expenses,
              )} · balans ${formatAZN(bucket.balance)}`}
            >
              <span className="chart-pair">
                <span
                  className="chart-bar chart-bar-income"
                  style={{ height: height(bucket.income) }}
                />
                <span
                  className="chart-bar chart-bar-expense"
                  style={{ height: height(bucket.expenses) }}
                />
              </span>
            </div>
          ))}
        </div>
      </div>

      <div
        className="chart-labels"
        style={{ gridTemplateColumns: `repeat(${buckets.length}, 1fr)` }}
      >
        {buckets.map((bucket) => (
          <span key={bucket.key} className="chart-label">
            {bucket.label}
          </span>
        ))}
      </div>

      <div className="legend">
        <span className="legend-item">
          <span className="legend-dot" style={{ background: 'var(--s2)' }} />
          Gəlir
        </span>
        <span className="legend-item">
          <span className="legend-dot" style={{ background: 'var(--s1)' }} />
          Xərc
        </span>
        {showLine && (
          <span className="legend-item">
            <span className="legend-rule" />
            Balans
          </span>
        )}
      </div>
    </div>
  )
}
