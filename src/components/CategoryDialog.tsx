import { useEffect, useState } from 'react'
import {
  categoriesOfType,
  categoryUsage,
  isCategoryInUse,
  validateCategoryName,
} from '../lib/categories'
import { useFinance } from '../store/FinanceProvider'
import type { CategoryDef, TransactionType } from '../lib/types'

/**
 * Create, rename or remove one category.
 *
 * Removal is the interesting case. A category that nothing uses is simply
 * dropped. One that is in use cannot be — the transactions naming it would be
 * left pointing at something that no longer exists — so the dialog asks where
 * that history should go instead, and says exactly how much of it there is.
 * The alternative, deleting the records too, would destroy money the user
 * never asked to remove.
 */
export function CategoryDialog({
  category,
  type,
  onClose,
}: {
  category: CategoryDef | null
  /** Which side of the ledger a new category belongs to. */
  type: TransactionType
  onClose: () => void
}) {
  const { data, addCategory, renameCategory, removeCategory } = useFinance()
  const [name, setName] = useState(category?.name ?? '')
  const [showErrors, setShowErrors] = useState(false)
  const [removing, setRemoving] = useState(false)

  const kind = category?.type ?? type
  const usage = category ? categoryUsage(data, category.name) : null
  const inUse = usage !== null && isCategoryInUse(usage)

  const alternatives = categoriesOfType(data, kind).filter(
    (option) => option.id !== category?.id,
  )
  const [reassignTo, setReassignTo] = useState(alternatives[0]?.name ?? '')

  const error = validateCategoryName(data, name, kind, category?.id)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (error) {
      setShowErrors(true)
      return
    }
    if (category) {
      renameCategory(category.id, name)
    } else {
      addCategory(name.trim(), kind)
    }
    onClose()
  }

  const confirmRemove = () => {
    if (!category) return
    // Nothing uses it, or everything that does has somewhere to go.
    removeCategory(category.id, inUse ? reassignTo : undefined)
    onClose()
  }

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label={category ? 'Kateqoriyanı dəyiş' : 'Yeni kateqoriya'}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form className="dialog" onSubmit={submit} noValidate>
        <div className="dialog-head">
          <div>
            <h2 className="dialog-title">
              {category ? 'Kateqoriyanı dəyiş' : 'Yeni kateqoriya'}
            </h2>
            <p className="dialog-subtitle">
              {kind === 'income' ? 'Gəlir' : 'Xərc'}
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Bağla">
            ✕
          </button>
        </div>

        {removing ? (
          <div className="dialog-body">
            {inUse ? (
              <>
                <p className="dialog-lead">
                  <strong>{category?.name}</strong> istifadə olunur:{' '}
                  {usage.transactions > 0 && `${usage.transactions} əməliyyat`}
                  {usage.transactions > 0 && usage.budgetLines > 0 && ', '}
                  {usage.budgetLines > 0 && `${usage.budgetLines} büdcə sətri`}.
                  Silinməmişdən əvvəl bunlar başqa kateqoriyaya keçirilir.
                </p>

                {alternatives.length > 0 ? (
                  <div className="field">
                    <label className="field-label" htmlFor="cat-reassign">
                      Bura keçirilsin
                    </label>
                    <div className="select-wrap">
                      <select
                        id="cat-reassign"
                        className="select"
                        value={reassignTo}
                        onChange={(event) => setReassignTo(event.target.value)}
                      >
                        {alternatives.map((option) => (
                          <option key={option.id} value={option.name}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <p className="field-error">
                    Keçirmək üçün başqa kateqoriya yoxdur. Əvvəlcə bir kateqoriya
                    əlavə edin.
                  </p>
                )}
              </>
            ) : (
              <p className="dialog-lead">
                <strong>{category?.name}</strong> heç bir yerdə istifadə olunmur və
                silinə bilər.
              </p>
            )}
          </div>
        ) : (
          <div className="dialog-body">
            <div className="field">
              <label className="field-label" htmlFor="cat-name">
                Ad
              </label>
              <input
                id="cat-name"
                className="input"
                autoFocus
                autoComplete="off"
                value={name}
                aria-invalid={Boolean(showErrors && error)}
                onChange={(event) => setName(event.target.value)}
              />
              {showErrors && error && <p className="field-error">{error}</p>}
            </div>

            {inUse && (
              <p className="field-note">
                Adın dəyişməsi bu kateqoriyanı işlədən{' '}
                {usage.transactions > 0 && `${usage.transactions} əməliyyatı`}
                {usage.transactions > 0 && usage.budgetLines > 0 && ' və '}
                {usage.budgetLines > 0 && `${usage.budgetLines} büdcə sətrini`} da
                yeni ada keçirir. Məbləğlər dəyişmir.
              </p>
            )}
          </div>
        )}

        <div className="dialog-foot">
          {category && !removing && (
            <button
              type="button"
              className="button button-danger"
              onClick={() => setRemoving(true)}
            >
              Sil
            </button>
          )}
          <span className="spacer" />

          {removing ? (
            <>
              <button type="button" className="button" onClick={() => setRemoving(false)}>
                Geri
              </button>
              <button
                type="button"
                className="button button-primary"
                disabled={inUse && alternatives.length === 0}
                onClick={confirmRemove}
              >
                {inUse ? 'Keçir və sil' : 'Sil'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="button" onClick={onClose}>
                Ləğv et
              </button>
              <button type="submit" className="button button-primary">
                Yadda saxla
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  )
}
