import { formatAZN } from '../lib/money'
import { formatDayShort } from '../lib/dates'
import type { Transaction } from '../lib/types'

export function TransactionList({
  transactions,
  onSelect,
}: {
  transactions: Transaction[]
  onSelect: (transaction: Transaction) => void
}) {
  return (
    <div className="card rows">
      {transactions.map((transaction) => {
        const isIncome = transaction.type === 'income'
        return (
          <button
            key={transaction.id}
            type="button"
            className="row"
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
            <span className={`row-amount${isIncome ? ' pos' : ''}`}>
              {isIncome ? '+' : '−'}
              {formatAZN(transaction.amount)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
