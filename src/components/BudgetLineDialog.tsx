import { useEffect, useState } from 'react'
import { parseAmount } from '../lib/money'
import { categoryNames } from '../lib/categories'
import { useFinance } from '../store/FinanceProvider'
import type { BudgetLine, ExpenseCategory } from '../lib/types'

type Values = { description: string; category: ExpenseCategory; planned: number }

/** Edits one row of 'Aylıq rasxod': description, category, planned amount. */
export function BudgetLineDialog({
  line,
  onSave,
  onDelete,
  onClose,
}: {
  line: BudgetLine | null
  onSave: (values: Values) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const { data } = useFinance()
  const categories = categoryNames(data, 'expense')

  const [description, setDescription] = useState(line?.description ?? '')
  const [category, setCategory] = useState<ExpenseCategory>(
    line?.category ?? categories[0] ?? '',
  )

  /* A line whose category has since been removed keeps it, so editing the
     line does not quietly move it somewhere else. */
  const options = categories.includes(category)
    ? categories
    : [...categories, category].filter(Boolean)
  const [planned, setPlanned] = useState(line ? String(line.planned) : '')
  const [showErrors, setShowErrors] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const amount = parseAmount(planned)
  // A planned amount of zero is valid — the sheet has such rows (e.g. "Кредитная
  // карта Кеш") for lines that are tracked but not budgeted this month.
  const descriptionError = description.trim() ? undefined : 'Təsvir yazın'
  const amountError =
    amount === null ? 'Enter an amount' : amount < 0 ? 'Mənfi ola bilməz' : undefined

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (descriptionError || amountError || amount === null) {
      setShowErrors(true)
      return
    }
    onSave({ description: description.trim(), category, planned: amount })
  }

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label={line ? 'Sətri dəyiş' : 'Yeni sətir'}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form className="dialog" onSubmit={submit} noValidate>
        <div className="dialog-head">
          <h2 className="dialog-title">{line ? 'Sətri dəyiş' : 'Yeni sətir'}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Bağla">
            ✕
          </button>
        </div>

        <div className="dialog-body">
          <div className="field">
            <label className="field-label" htmlFor="bl-description">
              Təsvir
            </label>
            <input
              id="bl-description"
              className="input"
              autoFocus
              autoComplete="off"
              value={description}
              aria-invalid={Boolean(showErrors && descriptionError)}
              onChange={(event) => setDescription(event.target.value)}
            />
            {showErrors && descriptionError && (
              <p className="field-error">{descriptionError}</p>
            )}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="bl-category">
              Kateqoriya
            </label>
            <div className="select-wrap">
              <select
                id="bl-category"
                className="select"
                value={category}
                onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
              >
                {options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="bl-planned">
              Planlaşdırılan məbləğ
            </label>
            <input
              id="bl-planned"
              className="input num"
              inputMode="decimal"
              placeholder="0.00"
              autoComplete="off"
              value={planned}
              aria-invalid={Boolean(showErrors && amountError)}
              onChange={(event) => setPlanned(event.target.value)}
            />
            {showErrors && amountError && <p className="field-error">{amountError}</p>}
          </div>
        </div>

        <div className="dialog-foot">
          {onDelete && (
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
            Yadda saxla
          </button>
        </div>
      </form>
    </div>
  )
}
