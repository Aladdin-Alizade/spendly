import { useEffect, useState } from 'react'
import { parseAmount } from '../lib/money'
import type { PlannedIncomeRow } from '../lib/categories'

/**
 * The planned side of income, one field per income category.
 *
 * The sheet had two fixed rows here. Income categories are the user's own now,
 * so the form is built from them — adding a category adds a line to plan for,
 * and no category is special.
 */
export function IncomePlanDialog({
  rows,
  amounts,
  onSave,
  onClose,
}: {
  /** One per income category, plus any figure a removed category left behind
   *  — which is editable here so it can be cleared rather than stranded. */
  rows: PlannedIncomeRow[]
  amounts: Record<string, number>
  onSave: (amounts: Record<string, number>) => void
  onClose: () => void
}) {
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.map((row) => [row.category, String(amounts[row.category] ?? 0)]),
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
    const amount = parseAmount(inputs[row.category] ?? '')
    return sum + (amount !== null && amount > 0 ? amount : 0)
  }, 0)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (rows.some((row) => errorFor(row.category))) {
      setShowErrors(true)
      return
    }
    onSave(
      Object.fromEntries(
        rows.map((row) => [row.category, parseAmount(inputs[row.category] ?? '') ?? 0]),
      ),
    )
  }

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Planlaşdırılan gəlir"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form className="dialog" onSubmit={submit} noValidate>
        <div className="dialog-head">
          <h2 className="dialog-title">Planlaşdırılan gəlir</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Bağla">
            ✕
          </button>
        </div>

        <div className="dialog-body">
          {rows.length === 0 ? (
            <p className="dialog-lead">
              Hələ gəlir kateqoriyası yoxdur. Aşağıdakı Kateqoriyalar bölməsindən
              əlavə edin.
            </p>
          ) : (
            rows.map((row, index) => {
              const error = errorFor(row.category)
              return (
                <div className="field" key={row.category}>
                  <label className="field-label" htmlFor={`ip-${index}`}>
                    {row.category}
                    {row.orphaned && ' · kateqoriya silinib'}
                  </label>
                  <input
                    id={`ip-${index}`}
                    className="input num"
                    inputMode="decimal"
                    placeholder="0.00"
                    autoComplete="off"
                    autoFocus={index === 0}
                    value={inputs[row.category] ?? ''}
                    aria-invalid={Boolean(showErrors && error)}
                    onChange={(event) =>
                      setInputs((previous) => ({
                        ...previous,
                        [row.category]: event.target.value,
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
