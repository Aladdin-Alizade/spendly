import { useEffect, useState } from 'react'
import { EmptyState } from '../components/primitives'
import { TransactionList } from '../components/TransactionList'
import { formatAZN, formatSignedAZN, sum } from '../lib/money'
import { formatMonth } from '../lib/dates'
import {
  filterTransactions,
  sortTransactions,
  transactionsInMonth,
  usedCategories,
  type TransactionTypeFilter,
} from '../lib/calc'
import type { FinanceData, MonthKey, Transaction } from '../lib/types'

/**
 * The full log for a month. Type, category and a search query — the month
 * switcher already handles the period.
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
  const [type, setType] = useState<TransactionTypeFilter>('all')
  const [category, setCategory] = useState('')
  const [query, setQuery] = useState('')

  const all = sortTransactions(transactionsInMonth(data.transactions, month))
  const typed = filterTransactions(all, { type })
  const categories = usedCategories(typed)
  const visible = filterTransactions(all, { type, category, query })

  useEffect(() => {
    if (category && !categories.includes(category)) setCategory('')
  }, [category, categories])

  // Adding income to expenses would be meaningless, so the unfiltered view
  // shows the net instead of a combined magnitude.
  const total =
    type === 'all'
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
          {(['all', 'expense', 'income'] as TransactionTypeFilter[]).map((option) => (
            <button
              key={option}
              type="button"
              className="tab"
              aria-current={type === option ? 'page' : undefined}
              onClick={() => setType(option)}
            >
              {option === 'all' ? 'Hamısı' : option === 'expense' ? 'Xərclər' : 'Gəlirlər'}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }} className="num">
          {visible.length} ·{' '}
          {type === 'all' ? formatSignedAZN(total) : formatAZN(total)}
        </span>
      </div>

      <div className="tx-filters">
        <input
          className="input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Axtar"
          aria-label="Əməliyyatlarda axtar"
        />
        {categories.length > 0 && (
          <div className="select-wrap">
            <select
              className="select"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-label="Kateqoriya"
            >
              <option value="">Bütün kateqoriyalar</option>
              {categories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Uyğun nəticə yoxdur"
            body={emptyFilterBody(month, type, category, query)}
          />
        </div>
      ) : (
        <TransactionList transactions={visible} onSelect={onSelect} />
      )}
    </section>
  )
}

function emptyFilterBody(
  month: MonthKey,
  type: TransactionTypeFilter,
  category: string,
  query: string,
): string {
  if (query.trim() || category) return 'Bu filtrlərə uyğun əməliyyat yoxdur.'
  return `${formatMonth(month)} üçün ${type === 'income' ? 'gəlir' : 'xərc'} qeydə alınmayıb.`
}
