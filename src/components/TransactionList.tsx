import { formatAZN } from '../lib/money'
import { RowDate } from './primitives'
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
            <RowDate transaction={transaction} />
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
