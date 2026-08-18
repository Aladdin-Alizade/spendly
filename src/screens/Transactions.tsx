import { useState } from 'react'
import { EmptyState } from '../components/primitives'
import { TransactionList } from '../components/TransactionList'
import { formatAZN, formatSignedAZN } from '../lib/money'
import { formatMonth } from '../lib/dates'
import { sortTransactions, transactionsInMonth } from '../lib/calc'
import { sum } from '../lib/money'
import type { FinanceData, MonthKey, Transaction, TransactionType } from '../lib/types'

type Filter = 'all' | TransactionType

/**
 * The full log for a month. One filter only — type — because the month
 * switcher already handles the period and categories are shown on the
 * dashboard breakdown.
 */
export function Transactions({
  data,
  month,
  onSelect,
  onAdd,
}: {
  data: FinanceData
  month: MonthKey
  onSelect: (transaction: Transaction) => void
  onAdd: () => void
}) {
  const [filter, setFilter] = useState<Filter>('all')

  const all = sortTransactions(transactionsInMonth(data.transactions, month))
  const visible = filter === 'all' ? all : all.filter((item) => item.type === filter)

  // Adding income to expenses would be meaningless, so the unfiltered view
  // shows the net instead of a combined magnitude.
  const total =
    filter === 'all'
      ? sum(visible.map((item) => (item.type === 'income' ? item.amount : -item.amount)))
      : sum(visible.map((item) => item.amount))

  if (all.length === 0) {
    return (
      <div className="card" style={{ marginTop: 28 }}>
        <EmptyState
          title={`${formatMonth(month)} üçün qeyd yoxdur`}
          body="Bu ay üçün əlavə etdiyiniz əməliyyatlar burada görünəcək."
          action={
            <button type="button" className="button button-primary" onClick={onAdd}>
              Əməliyyat əlavə et
            </button>
          }
        />
      </div>
    )
  }

  return (
    <section className="section">
      <div className="section-head">
        <div className="tabs">
          {(['all', 'expense', 'income'] as Filter[]).map((option) => (
            <button
              key={option}
              type="button"
              className="tab"
              aria-current={filter === option ? 'page' : undefined}
              onClick={() => setFilter(option)}
            >
              {option === 'all' ? 'Hamısı' : option === 'expense' ? 'Xərclər' : 'Gəlirlər'}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }} className="num">
          {visible.length} ·{' '}
          {filter === 'all' ? formatSignedAZN(total) : formatAZN(total)}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Uyğun nəticə yoxdur"
            body={`${formatMonth(month)} üçün ${filter === 'income' ? 'gəlir' : 'xərc'} qeydə alınmayıb.`}
          />
        </div>
      ) : (
        <TransactionList transactions={visible} onSelect={onSelect} />
      )}
    </section>
  )
}
