import { formatAZN } from '../../lib/money'
import type { IncomeSource } from '../../lib/analytics'

/** Income keeps to its own end of the palette, so a bar is never mistaken
 *  for spending at a glance. */
const HUES = ['--s2', '--s6', '--s4']

/**
 * What came in, per source, against what was planned for it.
 *
 * Both bars share one scale, so a source that arrived short of its plan is
 * shorter than the plan mark behind it — the shape carries the shortfall
 * before the figures are read.
 */
export function IncomeBars({ rows }: { rows: IncomeSource[] }) {
  const peak = Math.max(...rows.flatMap((row) => [row.actual, row.planned]), 0)
  const width = (value: number) => (peak > 0 ? `${(value / peak) * 100}%` : '0%')

  return (
    <div className="income">
      {rows.map((row, index) => {
        const short = Math.round((row.planned - row.actual) * 100) / 100
        return (
          <div
            className="income-row"
            key={row.category}
            style={{ '--series': `var(${HUES[index % HUES.length]})` } as React.CSSProperties}
          >
            <span className="income-name">{row.category}</span>
            <span className="income-amount num">{formatAZN(row.actual)}</span>

            <span className="income-track">
              {row.planned > 0 && (
                <span className="income-planned" style={{ width: width(row.planned) }} />
              )}
              <span className="income-actual" style={{ width: width(row.actual) }} />
            </span>

            <span className="income-meta">
              {row.planned > 0 ? (
                <>
                  <span>{formatAZN(row.planned)} planlaşdırılıb</span>
                  {Math.abs(short) >= 0.01 && (
                    <span className={short > 0 ? 'neg' : 'pos'}>
                      {short > 0 ? '−' : '+'}
                      {formatAZN(Math.abs(short))}
                    </span>
                  )}
                </>
              ) : (
                <span>planlaşdırılmayıb</span>
              )}
              {row.share > 0 && <span>{Math.round(row.share * 100)}%</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}
