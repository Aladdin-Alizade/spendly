/**
 * The shape of a run of values, at the size of a line of text.
 *
 * No axis and no labels: it sits beside the number it describes, and its job
 * is the direction and the turning points, not the readings.
 *
 * The viewBox is stretched to whatever width the card gives it, so everything
 * drawn here is a stroke with `non-scaling-stroke` — including the end marker,
 * which is a zero-length round-capped segment. A circle element would arrive
 * as an oval.
 */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null

  const width = 100
  const height = 32
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const points = values.map((value, index) => ({
    x: (index / (values.length - 1)) * width,
    y: height - ((value - min) / range) * (height - 8) - 4,
  }))

  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(' ')

  const last = points[points.length - 1]
  const dot = `M${last.x.toFixed(2)} ${last.y.toFixed(2)}L${last.x.toFixed(2)} ${last.y.toFixed(2)}`

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path className="spark-line" d={path} vectorEffect="non-scaling-stroke" />
      <path className="spark-halo" d={dot} vectorEffect="non-scaling-stroke" />
      <path className="spark-dot" d={dot} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
