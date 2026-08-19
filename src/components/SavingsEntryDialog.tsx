import { useEffect, useState } from 'react'
import { formatAZN, parseAmount } from '../lib/money'
import { potBalance } from '../lib/savings'
import { isValidDate } from '../lib/dates'
import { useFinance } from '../store/FinanceProvider'
import type { SavingsDirection, SavingsEntry, SavingsSource } from '../lib/types'

/**
 * One movement into or out of a pot.
 *
 * The two questions this asks that a transaction never does: which way the
 * money went, and — for a deposit — where it came from. The second one is what
 * keeps money that arrived from outside out of the income figures, so it is
 * asked plainly rather than inferred.
 */
export function SavingsEntryDialog({
  entry,
  defaultDate,
  defaultPot,
  onClose,
}: {
  entry: SavingsEntry | null
  defaultDate: string
  defaultPot?: string
  onClose: () => void
}) {
  const { data, addSavingsEntry, updateSavingsEntry, removeSavingsEntry } = useFinance()
  const pots = data.savingsPots.map((pot) => pot.name)

  const [direction, setDirection] = useState<SavingsDirection>(
    entry?.direction ?? 'in',
  )
  const [source, setSource] = useState<SavingsSource>(entry?.source ?? 'income')
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '')
  const [pot, setPot] = useState(entry?.pot ?? defaultPot ?? pots[0] ?? '')
  const [date, setDate] = useState(entry?.date ?? defaultDate)
  const [note, setNote] = useState(entry?.note ?? '')
  const [showErrors, setShowErrors] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  /* An entry whose pot has since been removed keeps it, so editing the entry
     does not quietly move the money somewhere else. */
  const options = pots.includes(pot) ? pots : [...pots, pot].filter(Boolean)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const parsed = parseAmount(amount)

  /* What the pot holds without this entry — so editing one does not measure
     a withdrawal against money the entry itself put there. */
  const available = potBalance(
    data.savingsEntries.filter((other) => other.id !== entry?.id),
    pot,
  )

  const amountError =
    parsed === null
      ? 'Məbləği daxil edin'
      : parsed <= 0
        ? 'Məbləğ sıfırdan böyük olmalıdır'
        : direction === 'out' && parsed > available
          ? `Bu qabda cəmi ${formatAZN(available)} var`
          : undefined
  const dateError = isValidDate(date) ? undefined : 'Tarixi yoxlayın'
  const potError = pot.trim() === '' ? 'Əvvəlcə bir qab yaradın' : undefined

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (amountError || dateError || potError || parsed === null) {
      setShowErrors(true)
      return
    }

    const values: Omit<SavingsEntry, 'id'> = {
      date,
      pot,
      amount: parsed,
      direction,
      // A withdrawal has no source. Carrying one over from the form would put
      // a meaningless value in the record and in the database.
      source: direction === 'in' ? source : undefined,
      note: note.trim() === '' ? undefined : note.trim(),
    }

    if (entry) updateSavingsEntry(entry.id, values)
    else addSavingsEntry(values)
    onClose()
  }

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label={entry ? 'Qeydi dəyiş' : 'Yeni yığım qeydi'}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form className="dialog" onSubmit={submit} noValidate>
        <div className="dialog-head">
          <h2 className="dialog-title">
            {entry ? 'Qeydi dəyiş' : 'Yığım hərəkəti'}
          </h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Bağla">
            ✕
          </button>
        </div>

        <div className="dialog-body">
          <div className="segmented" role="group" aria-label="İstiqamət">
            <button
              type="button"
              className="segment"
              aria-pressed={direction === 'in'}
              onClick={() => setDirection('in')}
            >
              Qoyuram
            </button>
            <button
              type="button"
              className="segment"
              aria-pressed={direction === 'out'}
              onClick={() => setDirection('out')}
            >
              Götürürəm
            </button>
          </div>

          {direction === 'in' && (
            <div className="field">
              <span className="field-label">Pul haradan gəlir?</span>
              <div className="segmented" role="group" aria-label="Mənbə">
                <button
                  type="button"
                  className="segment"
                  aria-pressed={source === 'income'}
                  onClick={() => setSource('income')}
                >
                  Gəlirimdən
                </button>
                <button
                  type="button"
                  className="segment"
                  aria-pressed={source === 'external'}
                  onClick={() => setSource('external')}
                >
                  Kənardan
                </button>
              </div>
              <p className="field-hint">
                {source === 'income'
                  ? 'Qazandığınız puldan kənara qoyulur: xərcləyə biləcəyiniz məbləğ azalır, amma bu xərc sayılmır.'
                  : 'Hədiyyə, satış, qaytarılan borc — kənardan birbaşa qaba gəlir. Gəlirinizə də, xərcinizə də toxunmur.'}
              </p>
            </div>
          )}

          <div className="field">
            <label className="field-label" htmlFor="se-amount">
              Məbləğ
            </label>
            <input
              id="se-amount"
              className="input input-amount num"
              inputMode="decimal"
              placeholder="0.00"
              autoComplete="off"
              autoFocus
              value={amount}
              aria-invalid={Boolean(showErrors && amountError)}
              onChange={(event) => setAmount(event.target.value)}
            />
            {showErrors && amountError && <p className="field-error">{amountError}</p>}
          </div>

          <div className="field-row">
            <div className="field">
              <label className="field-label" htmlFor="se-pot">
                Qab
              </label>
              <div className="select-wrap">
                <select
                  id="se-pot"
                  className="select"
                  value={pot}
                  onChange={(event) => setPot(event.target.value)}
                >
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              {showErrors && potError && <p className="field-error">{potError}</p>}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="se-date">
                Tarix
              </label>
              <input
                id="se-date"
                className="input"
                type="date"
                value={date}
                aria-invalid={Boolean(showErrors && dateError)}
                onChange={(event) => setDate(event.target.value)}
              />
              {showErrors && dateError && <p className="field-error">{dateError}</p>}
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="se-note">
              Qeyd <span className="field-optional">istəyə bağlı</span>
            </label>
            <input
              id="se-note"
              className="input"
              autoComplete="off"
              placeholder={direction === 'in' ? 'Avqust yığımı' : 'Nəyə lazım oldu?'}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          {direction === 'out' && (
            <p className="field-note">
              Götürdüyünüz pulu xərcləyəndə onu adi əməliyyat kimi öz
              kateqoriyasında yazın — bu qeyd yalnız pulun qabdan çıxdığını
              bildirir.
            </p>
          )}
        </div>

        <div className="dialog-foot">
          {entry && (
            <button
              type="button"
              className="button button-danger"
              onClick={() =>
                confirmingDelete
                  ? (removeSavingsEntry(entry.id), onClose())
                  : setConfirmingDelete(true)
              }
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
