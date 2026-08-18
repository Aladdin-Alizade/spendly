import { useEffect } from 'react'
import { formatAZN, sum } from '../lib/money'
import { formatDayShort } from '../lib/dates'
import { sortTransactions } from '../lib/calc'
import type { Transaction } from '../lib/types'

/**
 * The number behind a number. Opened by clicking any category or day in the
 * dashboard, so a figure can always be traced back to the transactions that
 * produced it.
 */
export function DetailDialog({
  title,
  subtitle,
  transactions,
  onSelect,
  onClose,
}: {
  title: string
  subtitle?: string
  transactions: Transaction[]
  onSelect: (transaction: Transaction) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const ordered = sortTransactions(transactions)
  const total = sum(
    ordered.map((item) => (item.type === 'income' ? item.amount : -item.amount)),
  )

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="dialog">
        <div className="dialog-head">
          <div>
            <h2 className="dialog-title">{title}</h2>
            {subtitle && <p className="dialog-subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Bağla">
            ✕
          </button>
        </div>

        <div className="dialog-list rows">
          {ordered.map((transaction) => (
            <button
              type="button"
              className="row"
              key={transaction.id}
              onClick={() => onSelect(transaction)}
            >
              <span className="row-date">{formatDayShort(transaction.date)}</span>
              <span className="row-main">
                <span className="row-title">{transaction.description}</span>
                <span className="row-meta">
                  {transaction.category}
                  {transaction.note ? ` · ${transaction.note}` : ''}
                </span>
              </span>
              <span
                className={`row-amount${transaction.type === 'income' ? ' pos' : ''}`}
              >
                {transaction.type === 'income' ? '+' : '−'}
                {formatAZN(transaction.amount)}
              </span>
            </button>
          ))}
        </div>

        <div className="dialog-foot">
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {ordered.length} əməliyyat
          </span>
          <span className="spacer" />
          <span className={`num${total < 0 ? ' neg' : ' pos'}`} style={{ fontWeight: 600 }}>
            {total >= 0 ? '+' : '−'}
            {formatAZN(Math.abs(total))}
          </span>
        </div>
      </div>
    </div>
  )
}
