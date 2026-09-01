import { useEffect, useRef, useState } from 'react'
import { formatAZN } from '../lib/money'
import { formatMonth } from '../lib/dates'
import { knownMonths } from '../lib/calc'
import { categoriesOfType } from '../lib/categories'
import { totalHoldings } from '../lib/calc'
import { useAuth } from '../store/AuthProvider'
import { useFinance } from '../store/FinanceProvider'
import { csvImportNotice } from '../lib/csv'
import {
  MIN_PASSWORD_LENGTH,
  hasPasswordChangeErrors,
  validatePasswordChange,
} from '../lib/credentials'
import type { PasswordChangeInput } from '../lib/credentials'
import type { SyncState } from '../lib/syncingRepository'

/**
 * The account, and what it holds.
 *
 * The user id is shown deliberately, and can be copied. It is the one piece of
 * plumbing a user ever needs: every row is scoped to it, so restoring records
 * that belong to an older identity is impossible without being able to read
 * it. Hiding it would mean nobody could recover their own data.
 */
export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const { status, user, signOut, changePassword } = useAuth()
  const { data, sync, syncNow, importCsv, exportCsv } = useFinance()
  const [copied, setCopied] = useState(false)
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)
  const [csvNotice, setCsvNotice] = useState<string | null>(null)
  const [importDate, setImportDate] = useState('')
  const csvInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const months = knownMonths(data, '')
    .filter((month) => month !== '')
    .sort()
  const expenses = data.transactions.filter((t) => t.type === 'expense').length
  const income = data.transactions.length - expenses

  const copyId = async () => {
    if (!user) return
    try {
      await navigator.clipboard.writeText(user.id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused; the id is selectable on screen anyway.
    }
  }

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Profil"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="dialog">
        <div className="dialog-head">
          <div>
            <h2 className="dialog-title">Profil</h2>
            <p className="dialog-subtitle">
              {status === 'signed-in' ? 'Hesab məlumatları' : 'Bu brauzerdə saxlanılır'}
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Bağla">
            ✕
          </button>
        </div>

        <div className="dialog-body">
          {status === 'signed-in' && user ? (
            <>
              <div className="profile-identity">
                <span className="profile-avatar" aria-hidden="true">
                  {(user.email ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="profile-identity-text">
                  <span className="profile-email">{user.email ?? 'e-poçt yoxdur'}</span>
                  {user.createdAt && (
                    <span className="profile-since">
                      Hesab yaradılıb: {user.createdAt.slice(0, 10)}
                    </span>
                  )}
                </span>
              </div>

              <div className="profile-id">
                <p className="micro">İstifadəçi ID</p>
                <p className="profile-id-value num">{user.id}</p>
                <p className="profile-id-note">
                  Bütün qeydləriniz bu ID-yə bağlıdır. Məlumat bərpası lazım olsa,
                  bu lazım olacaq.
                </p>
                <button type="button" className="button button-quiet" onClick={copyId}>
                  {copied ? 'Kopyalandı' : 'ID-ni kopyala'}
                </button>
              </div>
            </>
          ) : (
            <p className="profile-local">
              Hesab yoxdur — məlumatlar yalnız bu brauzerdə saxlanılır. Brauzer
              məlumatlarını təmizləsəniz, silinəcək.
            </p>
          )}

          {status === 'signed-in' && (
            <div className="profile-sync">
              <span className="profile-sync-text">
                <span className="micro">Sinxronizasiya</span>
                <span className={`profile-sync-state${syncTone(sync.status)}`}>
                  {syncLabel(sync)}
                </span>
              </span>
              {sync.status !== 'synced' && (
                <button type="button" className="button button-quiet" onClick={syncNow}>
                  İndi göndər
                </button>
              )}
            </div>
          )}

          <div className="profile-stats">
            <Stat label="Əməliyyat" value={String(data.transactions.length)} />
            <Stat label="Xərc / gəlir" value={`${expenses} / ${income}`} />
            <Stat label="Kateqoriya" value={String(data.categories.length)} />
            <Stat
              label="Balans"
              value={formatAZN(totalHoldings(data))}
            />
          </div>

          <div className="profile-csv">
            <div className="field">
              <label className="field-label" htmlFor="csv-date">
                Tarix{' '}
                <span style={{ color: 'var(--text-faint)' }}>· istəyə bağlı</span>
              </label>
              <input
                id="csv-date"
                className="input"
                type="date"
                max="2999-12-31"
                value={importDate}
                onChange={(event) => setImportDate(event.target.value)}
              />
            </div>
            <div className="profile-csv-actions">
              <button
                type="button"
                className="button"
                onClick={() => {
                  const csv = exportCsv()
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
                  const url = URL.createObjectURL(blob)
                  const link = document.createElement('a')
                  link.href = url
                  link.download = 'spendly-emeliyyatlar.csv'
                  link.click()
                  URL.revokeObjectURL(url)
                }}
              >
                CSV ixrac et
              </button>
              <button
                type="button"
                className="button"
                onClick={() => csvInputRef.current?.click()}
              >
                CSV idxal et
              </button>
            </div>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (!file) return
                void file.text().then((text) => {
                  setCsvNotice(
                    csvImportNotice(importCsv(text, importDate.trim() || undefined)),
                  )
                })
              }}
            />
            <p className="profile-csv-note">
              {csvNotice ?? 'Boşdursa fayldakı tarix qalır.'}
            </p>
          </div>

          {status === 'signed-in' && <PasswordChange onSubmit={changePassword} />}

          {months.length > 0 && (
            <p className="profile-range">
              {months.length === 1
                ? `Əhatə olunan ay: ${formatMonth(months[0])}`
                : `Əhatə olunan aylar: ${formatMonth(months[0])} — ${formatMonth(months[months.length - 1])} (${months.length} ay, planlaşdırılan aylar daxil)`}
              {' · '}
              {categoriesOfType(data, 'expense').length} xərc,{' '}
              {categoriesOfType(data, 'income').length} gəlir kateqoriyası
            </p>
          )}
        </div>

        <div className="dialog-foot">
          {status === 'signed-in' && (
            <button
              type="button"
              className="button button-danger"
              onClick={() => {
                if (confirmingSignOut) void signOut()
                else setConfirmingSignOut(true)
              }}
            >
              {confirmingSignOut ? 'Çıxışı təsdiqlə' : 'Çıxış'}
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>
            Bağla
          </button>
        </div>
      </div>
    </div>
  )
}

/** What the sync state means, in the user's own language. */
function syncLabel(sync: SyncState): string {
  switch (sync.status) {
    case 'synced':
      return 'Hər şey hesabda saxlanılıb'
    case 'pending':
      return 'Bu brauzerdə gözləyən dəyişiklik var'
    case 'offline':
      return 'Oflayn — serverə çıxış yoxdur'
    case 'failed':
      // The banner above already says the server refused it, in those words.
      return sync.message?.trim() || 'Son dəyişiklik göndərilmədi'
  }
}

function syncTone(status: SyncState['status']): string {
  if (status === 'synced') return ' pos'
  return status === 'failed' ? ' neg' : ''
}

/**
 * Changing the password, without leaving the account screen.
 *
 * Closed by default: it is a thing you occasionally need, not a thing you
 * came here to look at, and three password fields sitting open in a dialog
 * about an account read as though something were wrong with it.
 */
function PasswordChange({
  onSubmit,
}: {
  onSubmit(currentPassword: string, nextPassword: string): Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState<PasswordChangeInput>({
    current: '',
    next: '',
    repeat: '',
  })
  const [showErrors, setShowErrors] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const errors = validatePasswordChange(input)
  const visible = showErrors ? errors : {}

  const set = (key: keyof PasswordChangeInput, value: string) => {
    setInput((previous) => ({ ...previous, [key]: value }))
    setDone(false)
    setFailure(null)
  }

  if (!open) {
    return (
      <div className="profile-password">
        <span className="profile-password-text">
          <span className="micro">Şifrə</span>
          <span className="profile-password-state">
            {done ? 'Şifrə dəyişdirildi' : 'Hesabınızın şifrəsini dəyişin'}
          </span>
        </span>
        <button type="button" className="button button-quiet" onClick={() => setOpen(true)}>
          Dəyiş
        </button>
      </div>
    )
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setFailure(null)
    if (hasPasswordChangeErrors(errors)) {
      setShowErrors(true)
      return
    }

    setBusy(true)
    try {
      await onSubmit(input.current, input.next)
      setInput({ current: '', next: '', repeat: '' })
      setShowErrors(false)
      setDone(true)
      setOpen(false)
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : 'Alınmadı')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="profile-password-form" onSubmit={submit} noValidate>
      <p className="micro">Şifrəni dəyiş</p>

      <div className="field">
        <label className="field-label" htmlFor="pw-current">
          Cari şifrə
        </label>
        <input
          id="pw-current"
          className="input"
          type="password"
          autoComplete="current-password"
          value={input.current}
          onChange={(event) => set('current', event.target.value)}
        />
        {visible.current && <p className="field-error">{visible.current}</p>}
      </div>

      <div className="field">
        <label className="field-label" htmlFor="pw-next">
          Yeni şifrə
        </label>
        <input
          id="pw-next"
          className="input"
          type="password"
          autoComplete="new-password"
          value={input.next}
          onChange={(event) => set('next', event.target.value)}
        />
        {visible.next ? (
          <p className="field-error">{visible.next}</p>
        ) : (
          <p className="field-hint">Ən azı {MIN_PASSWORD_LENGTH} simvol.</p>
        )}
      </div>

      <div className="field">
        <label className="field-label" htmlFor="pw-repeat">
          Yeni şifrə (təkrar)
        </label>
        <input
          id="pw-repeat"
          className="input"
          type="password"
          autoComplete="new-password"
          value={input.repeat}
          onChange={(event) => set('repeat', event.target.value)}
        />
        {visible.repeat && <p className="field-error">{visible.repeat}</p>}
      </div>

      {failure && <p className="field-error">{failure}</p>}

      <div className="profile-password-actions">
        <button
          type="button"
          className="button"
          onClick={() => {
            setOpen(false)
            setShowErrors(false)
            setFailure(null)
          }}
        >
          Ləğv et
        </button>
        <button type="submit" className="button button-primary" disabled={busy}>
          {busy ? 'Gözləyin…' : 'Şifrəni dəyiş'}
        </button>
      </div>
    </form>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile-stat">
      <p className="micro">{label}</p>
      <p className="profile-stat-value num">{value}</p>
    </div>
  )
}
