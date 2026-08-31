import { useEffect, useMemo, useRef, useState } from 'react'
import { parseAmount } from '../lib/money'
import { hasErrors, validateTransaction } from '../lib/validate'
import type { FieldErrors, TransactionInput } from '../lib/validate'
import { categoryNames } from '../lib/categories'
import { descriptionSuggestions, lastCategoryForDescription } from '../lib/calc'
import { useFinance } from '../store/FinanceProvider'
import type { Transaction, TransactionType } from '../lib/types'

/**
 * Add / edit. Deliberately six fields, five of which are pre-filled or
 * one-tap, so logging a spend takes a description and an amount.
 */
export function TransactionDialog({
  transaction,
  defaultDate,
  onSave,
  onDelete,
  onClose,
}: {
  transaction: Transaction | null
  defaultDate: string
  onSave: (values: Omit<Transaction, 'id'>) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const isEditing = transaction !== null
  const { data } = useFinance()

  const expenseCategories = categoryNames(data, 'expense')
  const incomeCategories = categoryNames(data, 'income')

  const [input, setInput] = useState<TransactionInput>(() => ({
    date: transaction?.date ?? defaultDate,
    type: transaction?.type ?? 'expense',
    category: transaction?.category ?? categoryNames(data, 'expense')[0] ?? '',
    description: transaction?.description ?? '',
    amount: transaction ? String(transaction.amount) : '',
    note: transaction?.note ?? '',
    repeats: transaction?.repeats === 'monthly',
  }))
  const [showErrors, setShowErrors] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  /* An edit already has its category; filling from memory would overwrite it. */
  const [categoryTouched, setCategoryTouched] = useState(isEditing)

  const categories = input.type === 'income' ? incomeCategories : expenseCategories

  /* A transaction being edited keeps a category that has since been removed,
     so it stays selectable here — editing an old record must not silently
     move it to a different category. */
  const options = categories.includes(input.category)
    ? categories
    : [...categories, input.category].filter(Boolean)

  const errors: FieldErrors = useMemo(
    () => validateTransaction(input, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input, options.join('\u0000')],
  )
  const visibleErrors = showErrors ? errors : {}

  const suggestions = useMemo(() => {
    const remembered = descriptionSuggestions(
      data.transactions,
      input.type,
      input.description,
    )
    const current = input.description.trim().toLocaleLowerCase('az')
    return remembered.filter((label) => label.toLocaleLowerCase('az') !== current)
  }, [data.transactions, input.type, input.description])

  const firstFieldRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    firstFieldRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const set = <K extends keyof TransactionInput>(key: K, value: TransactionInput[K]) =>
    setInput((previous) => ({ ...previous, [key]: value }))

  const fillCategoryFromMemory = (
    previous: TransactionInput,
    description: string,
  ): string => {
    if (categoryTouched) return previous.category
    const remembered = lastCategoryForDescription(
      data.transactions,
      previous.type,
      description,
    )
    const allowed = previous.type === 'income' ? incomeCategories : expenseCategories
    return remembered && allowed.includes(remembered) ? remembered : previous.category
  }

  const setType = (type: TransactionType) => {
    setCategoryTouched(false)
    setInput((previous) => ({
      ...previous,
      type,
      // Category lists differ per type, so reset to a valid one.
      category: (type === 'income' ? incomeCategories[0] : expenseCategories[0]) ?? '',
    }))
  }

  const setDescription = (description: string) => {
    setInput((previous) => ({
      ...previous,
      description,
      category: fillCategoryFromMemory(previous, description),
    }))
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (hasErrors(errors)) {
      setShowErrors(true)
      return
    }
    onSave({
      date: input.date,
      type: input.type,
      category: input.category as Transaction['category'],
      description: input.description.trim(),
      amount: parseAmount(input.amount) ?? 0,
      note: input.note.trim() || undefined,
      repeats: input.repeats ? 'monthly' : undefined,
    })
  }

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? 'Əməliyyatı dəyiş' : 'Yeni əməliyyat'}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form className="dialog" onSubmit={submit} noValidate>
        <div className="dialog-head">
          <h2 className="dialog-title">
            {isEditing ? 'Əməliyyatı dəyiş' : 'Yeni əməliyyat'}
          </h2>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Bağla"
          >
            ✕
          </button>
        </div>

        <div className="dialog-body">
          <div className="segmented" role="group" aria-label="Növ">
            <button
              type="button"
              className="segment"
              aria-pressed={input.type === 'expense'}
              onClick={() => setType('expense')}
            >
              Xərc
            </button>
            <button
              type="button"
              className="segment"
              aria-pressed={input.type === 'income'}
              onClick={() => setType('income')}
            >
              Gəlir
            </button>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="tx-amount">
              Məbləğ
            </label>
            <input
              id="tx-amount"
              ref={firstFieldRef}
              className="input input-amount num"
              inputMode="decimal"
              placeholder="0.00"
              autoComplete="off"
              value={input.amount}
              aria-invalid={Boolean(visibleErrors.amount)}
              onChange={(event) => set('amount', event.target.value)}
            />
            {visibleErrors.amount && (
              <p className="field-error">{visibleErrors.amount}</p>
            )}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="tx-description">
              Təsvir
            </label>
            <input
              id="tx-description"
              className="input"
              list="tx-description-list"
              placeholder={
                input.type === 'income' ? 'Avqust maaşı' : 'Nə aldınız?'
              }
              autoComplete="off"
              value={input.description}
              aria-invalid={Boolean(visibleErrors.description)}
              onChange={(event) => setDescription(event.target.value)}
            />
            <datalist id="tx-description-list">
              {suggestions.map((label) => (
                <option key={label} value={label} />
              ))}
            </datalist>
            {suggestions.length > 0 && (
              <div className="suggest-chips" role="list">
                {suggestions.map((label) => (
                  <button
                    key={label}
                    type="button"
                    className="suggest-chip"
                    onClick={() => setDescription(label)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {visibleErrors.description && (
              <p className="field-error">{visibleErrors.description}</p>
            )}
          </div>

          <div className="field-row">
            <div className="field">
              <label className="field-label" htmlFor="tx-category">
                Kateqoriya
              </label>
              <div className="select-wrap">
                <select
                  id="tx-category"
                  className="select"
                  value={input.category}
                  onChange={(event) => {
                    setCategoryTouched(true)
                    set('category', event.target.value)
                  }}
                >
                  {options.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="tx-date">
                Tarix
              </label>
              <input
                id="tx-date"
                className="input"
                type="date"
                max="2999-12-31"
                value={input.date}
                aria-invalid={Boolean(visibleErrors.date)}
                onChange={(event) => set('date', event.target.value)}
              />
              {visibleErrors.date && (
                <p className="field-error">{visibleErrors.date}</p>
              )}
            </div>
          </div>

          {/* An account starts with no categories at all, so an empty list is a
              normal first step rather than a mistake. Saying where they are
              made beats a select with nothing in it — and it sits below the
              row, at full width, because half a column is not enough to read
              a sentence in on a phone. */}
          {options.length === 0 && (
            <p className="field-note">
              {input.type === 'income' ? 'Gəlir' : 'Xərc'} kateqoriyası hələ
              yoxdur. Büdcə → Quraşdırma → <strong>Kateqoriyalar</strong>
              bölməsindən əlavə edin.
            </p>
          )}

          <div className="field">
            <label className="field-label" htmlFor="tx-note">
              Qeyd{' '}
              <span style={{ color: 'var(--text-faint)' }}>· istəyə bağlı</span>
            </label>
            <input
              id="tx-note"
              className="input"
              autoComplete="off"
              value={input.note}
              onChange={(event) => set('note', event.target.value)}
            />
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={input.repeats}
              onChange={(event) => set('repeats', event.target.checked)}
            />
            Hər ay təkrarlanır
          </label>
        </div>

        <div className="dialog-foot">
          {isEditing && onDelete && (
            <button
              type="button"
              className="button button-danger"
              onClick={() => (confirmingDelete ? onDelete() : setConfirmingDelete(true))}
            >
              {confirmingDelete ? 'Silinməni təsdiqlə' : 'Sil'}
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>
            Ləğv et
          </button>
          <button type="submit" className="button button-primary">
            {isEditing ? 'Yadda saxla' : 'Əlavə et'}
          </button>
        </div>
      </form>
    </div>
  )
}
