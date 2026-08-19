import { useEffect, useState } from 'react'
import {
  categoriesOfType,
  categoryUsage,
  isCategoryInUse,
  validateCategoryName,
} from '../lib/categories'
import { useFinance } from '../store/FinanceProvider'
import { SELECTABLE_CATEGORY_KINDS } from '../lib/types'
import { KIND_LABEL } from '../lib/insights/classification'
import type { CategoryDef, CategoryKind, TransactionType } from '../lib/types'

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
  const { data, addCategory, renameCategory, removeCategory, setCategoryKind } = useFinance()
  const [name, setName] = useState(category?.name ?? '')
  const [kind, setKind] = useState<CategoryKind | undefined>(category?.kind)
  const [showErrors, setShowErrors] = useState(false)
  const [removing, setRemoving] = useState(false)

  const kindOfCategory = category?.type ?? type
  const usage = category ? categoryUsage(data, category.name) : null
  const inUse = usage !== null && isCategoryInUse(usage)

  const alternatives = categoriesOfType(data, kindOfCategory).filter(
    (option) => option.id !== category?.id,
  )
  const [reassignTo, setReassignTo] = useState(alternatives[0]?.name ?? '')

  const error = validateCategoryName(data, name, kindOfCategory, category?.id)

  /* `saving` is no longer offered — pots do that job — but a category written
     before them still carries it, and dropping it from the list would show an
     empty select for a category that is in fact classified. */
  const kindOptions =
    kind === 'saving'
      ? [...SELECTABLE_CATEGORY_KINDS, 'saving' as const]
      : SELECTABLE_CATEGORY_KINDS

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
      if (kind !== category.kind) setCategoryKind(category.id, kind)
    } else {
      addCategory(name.trim(), kindOfCategory, kind)
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
              {kindOfCategory === 'income' ? 'Gəlir' : 'Xərc'}
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

            {kindOfCategory === 'expense' && (
              <div className="field">
                <label className="field-label" htmlFor="cat-kind">
                  Növü
                </label>
                <div className="select-wrap">
                  <select
                    id="cat-kind"
                    className="select"
                    value={kind ?? ''}
                    onChange={(event) =>
                      setKind((event.target.value || undefined) as CategoryKind | undefined)
                    }
                  >
                    <option value="">Təsnif edilməyib</option>
                    {kindOptions.map((option) => (
                      <option key={option} value={option}>
                        {KIND_LABEL[option]}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="field-hint">
                  Ehtiyac/istək bölgüsü, 50/30/20 və təcili fond hesablamaları
                  bundan istifadə edir. Boş qalsa, həmin bölmələr bunu bildirir.
                </p>
                {kind === 'saving' && (
                  <p className="field-note">
                    Bu kateqoriya yığım qablarından əvvəl yazılıb. Yığım artıq
                    ayrıca Yığım səhifəsində aparılır — orada bu xərcləri qab
                    hərəkətinə çevirmək təklif olunur. Çevirdikdən sonra bu növü
                    boş buraxa bilərsiniz.
                  </p>
                )}
              </div>
            )}

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
