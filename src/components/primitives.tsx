import type { ReactNode } from 'react'

/** A titled block on the list screens, where content is one card deep. */
export function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/**
 * One cell of the dashboard grid: a card that names itself.
 *
 * The title lives inside the card rather than above it, so a card can be
 * moved anywhere in the grid without a heading being orphaned beside it.
 * `flush` is for content that draws its own full-width rows.
 */
export function Panel({
  title,
  note,
  span,
  flush = false,
  children,
}: {
  title: string
  note?: ReactNode
  span: 4 | 6 | 8 | 12
  flush?: boolean
  children: ReactNode
}) {
  return (
    <section className={`card panel col-${span}`}>
      <header className="panel-head">
        <h2 className="micro">{title}</h2>
        {note}
      </header>
      <div className={flush ? 'panel-body-flush' : 'panel-body'}>{children}</div>
    </section>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      <p className="empty-body">{body}</p>
      {action}
    </div>
  )
}

/** Proportional bar. `over` flips it to the warning colour past 100%. */
export function Meter({ value, max }: { value: number; max: number }) {
  const ratio = max > 0 ? value / max : 0
  const width = Math.min(Math.max(ratio, 0), 1) * 100
  return (
    <div className="meter">
      <div
        className={`meter-fill${ratio > 1 ? ' over' : ''}`}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}
