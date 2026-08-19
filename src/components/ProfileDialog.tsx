import { useEffect, useState } from 'react'
import { formatAZN } from '../lib/money'
import { formatMonth } from '../lib/dates'
import { knownMonths } from '../lib/calc'
import { categoriesOfType } from '../lib/categories'
import { runningBalance } from '../lib/calc'
import { useAuth } from '../store/AuthProvider'
import { useFinance } from '../store/FinanceProvider'
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
  const { status, user, signOut } = useAuth()
  const { data, sync, syncNow } = useFinance()
  const [copied, setCopied] = useState(false)
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)

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
              value={formatAZN(runningBalance(data.transactions))}
            />
          </div>

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
      return sync.message?.trim() || 'Server dəyişikliyi qəbul etmədi'
  }
}

function syncTone(status: SyncState['status']): string {
  if (status === 'synced') return ' pos'
  return status === 'failed' ? ' neg' : ''
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile-stat">
      <p className="micro">{label}</p>
      <p className="profile-stat-value num">{value}</p>
    </div>
  )
}
