import { useEffect, useState } from 'react'
import { parseAmount } from '../lib/money'

export interface PlannedRow {
  name: string
  /** The plan holds a figure for something that no longer exists. */
  orphaned: boolean
}

/**
 * A planned figure per named thing: income per category, savings per pot.
 *
 * Both sides of the plan ask the same question in the same shape, so they get
 * the same form. The list is built from what the account actually holds —
 * adding a category or a pot adds a line to plan for, and none is special.
 */
export function PlannedAmountsDialog({
  title,
  emptyText,
  idPrefix,
  rows,
  amounts,
  onSave,
  onClose,
}: {
  title: string
  /** Shown when there is nothing to plan for yet, naming the way out. */
  emptyText: string
  /** Distinguishes the field ids when two of these exist on one screen. */
  idPrefix: string
  /** One per row, plus any figure a removed one left behind — editable here
   *  so it can be cleared rather than stranded. */
  rows: PlannedRow[]
  amounts: Record<string, number>
  onSave: (amounts: Record<string, number>) => void
  onClose: () => void
}) {
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.map((row) => [row.name, String(amounts[row.name] ?? 0)]),
    ),
  )
  const [showErrors, setShowErrors] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const errorFor = (name: string): string | undefined => {
    const amount = parseAmount(inputs[name] ?? '')
    if (amount === null) return 'Məbləği daxil edin'
    return amount < 0 ? 'Mənfi ola bilməz' : undefined
  }

  const total = rows.reduce((sum, row) => {
    const amount = parseAmount(inputs[row.name] ?? '')
    return sum + (amount !== null && amount > 0 ? amount : 0)
  }, 0)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (rows.some((row) => errorFor(row.name))) {
      setShowErrors(true)
      return
    }
    onSave(
      Object.fromEntries(
        rows.map((row) => [row.name, parseAmount(inputs[row.name] ?? '') ?? 0]),
      ),
    )
  }

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
      <form className="dialog" onSubmit={submit} noValidate>
        <div className="dialog-head">
          <h2 className="dialog-title">{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Bağla">
            ✕
          </button>
        </div>

        <div className="dialog-body">
          {rows.length === 0 ? (
            <p className="dialog-lead">{emptyText}</p>
          ) : (
            rows.map((row, index) => {
              const error = errorFor(row.name)
              return (
                <div className="field" key={row.name}>
                  <label className="field-label" htmlFor={`${idPrefix}-${index}`}>
                    {row.name}
                    {row.orphaned && ' · silinib'}
                  </label>
                  <input
                    id={`${idPrefix}-${index}`}
                    className="input num"
                    inputMode="decimal"
                    placeholder="0.00"
                    autoComplete="off"
                    autoFocus={index === 0}
                    value={inputs[row.name] ?? ''}
                    aria-invalid={Boolean(showErrors && error)}
                    onChange={(event) =>
                      setInputs((previous) => ({
                        ...previous,
                        [row.name]: event.target.value,
                      }))
                    }
                  />
                  {showErrors && error && <p className="field-error">{error}</p>}
                </div>
              )
            })
          )}

          {rows.length > 1 && (
            <p className="field-note">
              Cəmi:{' '}
              <strong className="num">
                {new Intl.NumberFormat('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }).format(total)}{' '}
                ₼
              </strong>
            </p>
          )}
        </div>

        <div className="dialog-foot">
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>
            Ləğv et
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={rows.length === 0}
          >
            Yadda saxla
          </button>
        </div>
      </form>
    </div>
  )
}
