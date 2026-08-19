import { useEffect, useState } from 'react'
import { parseAmount, formatAZN } from '../lib/money'
import { potBalance, validatePotName } from '../lib/savings'
import { useFinance } from '../store/FinanceProvider'
import type { SavingsPot } from '../lib/types'

/**
 * Naming a goal, and saying what it is being filled towards.
 *
 * A target is optional on purpose. Somebody who is simply putting money aside
 * has no finish line, and inventing one for them would turn a healthy habit
 * into a bar they are always failing to clear.
 */
export function SavingsPotDialog({
  pot,
  onClose,
}: {
  pot: SavingsPot | null
  onClose: () => void
}) {
  const { data, addSavingsPot, renameSavingsPot, setSavingsPotTarget, removeSavingsPot } =
    useFinance()

  const [name, setName] = useState(pot?.name ?? '')
  const [target, setTarget] = useState(pot?.target ? String(pot.target) : '')
  const [showErrors, setShowErrors] = useState(false)
  const [removing, setRemoving] = useState(false)

  const entryCount = pot
    ? data.savingsEntries.filter((entry) => entry.pot === pot.name).length
    : 0
  const balance = pot ? potBalance(data.savingsEntries, pot.name) : 0
  const inUse = entryCount > 0
  const alternatives = data.savingsPots.filter((other) => other.id !== pot?.id)
  const [reassignTo, setReassignTo] = useState(alternatives[0]?.name ?? '')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const nameError = validatePotName(data, name, pot?.id)
  const parsedTarget = target.trim() === '' ? null : parseAmount(target)
  const targetError =
    target.trim() !== '' && (parsedTarget === null || parsedTarget <= 0)
      ? 'Hədəf sıfırdan böyük olmalıdır'
      : undefined

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (nameError || targetError) {
      setShowErrors(true)
      return
    }

    const value = parsedTarget && parsedTarget > 0 ? parsedTarget : undefined
    if (pot) {
      renameSavingsPot(pot.id, name)
      if (value !== pot.target) setSavingsPotTarget(pot.id, value)
    } else {
      addSavingsPot(name, value)
    }
    onClose()
  }

  const confirmRemove = () => {
    if (!pot) return
    removeSavingsPot(pot.id, inUse ? reassignTo : undefined)
    onClose()
  }

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label={pot ? 'Qabı dəyiş' : 'Yeni qab'}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form className="dialog" onSubmit={submit} noValidate>
        <div className="dialog-head">
          <h2 className="dialog-title">{pot ? 'Qabı dəyiş' : 'Yeni qab'}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Bağla">
            ✕
          </button>
        </div>

        {removing ? (
          <div className="dialog-body">
            {inUse ? (
              <>
                <p className="dialog-lead">
                  <strong>{pot?.name}</strong> qabında {formatAZN(balance)} var,{' '}
                  {entryCount} qeyd. Silinməmişdən əvvəl bunlar başqa qaba keçirilir
                  — pul heç yerə itmir.
                </p>

                {alternatives.length > 0 ? (
                  <div className="field">
                    <label className="field-label" htmlFor="pot-reassign">
                      Bura keçirilsin
                    </label>
                    <div className="select-wrap">
                      <select
                        id="pot-reassign"
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
                    Keçirmək üçün başqa qab yoxdur. Əvvəlcə bir qab əlavə edin.
                  </p>
                )}
              </>
            ) : (
              <p className="dialog-lead">
                <strong>{pot?.name}</strong> boşdur və silinə bilər.
              </p>
            )}
          </div>
        ) : (
          <div className="dialog-body">
            <div className="field">
              <label className="field-label" htmlFor="pot-name">
                Ad
              </label>
              <input
                id="pot-name"
                className="input"
                autoFocus
                autoComplete="off"
                placeholder="Ehtiyat fondu"
                value={name}
                aria-invalid={Boolean(showErrors && nameError)}
                onChange={(event) => setName(event.target.value)}
              />
              {showErrors && nameError && <p className="field-error">{nameError}</p>}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="pot-target">
                Hədəf <span className="field-optional">istəyə bağlı</span>
              </label>
              <input
                id="pot-target"
                className="input num"
                inputMode="decimal"
                placeholder="0.00"
                autoComplete="off"
                value={target}
                aria-invalid={Boolean(showErrors && targetError)}
                onChange={(event) => setTarget(event.target.value)}
              />
              {showErrors && targetError && (
                <p className="field-error">{targetError}</p>
              )}
              <p className="field-hint">
                Boş qalsa, qab sadəcə balansı ilə göstərilir — olmayan bir finiş
                xətti uydurulmur.
              </p>
            </div>

            {inUse && (
              <p className="field-note">
                Adın dəyişməsi bu qabın {entryCount} qeydini də yeni ada keçirir.
                Məbləğlər dəyişmir.
              </p>
            )}
          </div>
        )}

        <div className="dialog-foot">
          {pot && !removing && (
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
