import { useState } from 'react'
import { MonthSwitcher } from './components/MonthSwitcher'
import { TransactionDialog } from './components/TransactionDialog'
import { ProfileDialog } from './components/ProfileDialog'
import { Dashboard } from './screens/Dashboard'
import { Transactions } from './screens/Transactions'
import { Budget } from './screens/Budget'
import { Advice } from './screens/Advice'
import { knownMonths } from './lib/calc'
import { currentMonth, monthOf, today } from './lib/dates'
import { useFinance } from './store/FinanceProvider'
import { useAuth } from './store/AuthProvider'
import { setupHint } from './lib/setupHints'
import type { SyncState } from './lib/syncingRepository'
import type { MonthKey, Transaction } from './lib/types'

type Screen = 'dashboard' | 'transactions' | 'budget' | 'advice'

const SCREENS: { id: Screen; label: string }[] = [
  { id: 'dashboard', label: 'İcmal' },
  { id: 'transactions', label: 'Əməliyyatlar' },
  { id: 'budget', label: 'Büdcə' },
  { id: 'advice', label: 'Məsləhətlər' },
]

export function App() {
  const {
    data,
    status,
    error,
    sync,
    syncMessageDismissed,
    dismissSyncMessage,
    syncNow,
    retry,
    addTransaction,
    updateTransaction,
    removeTransaction,
  } = useFinance()
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [month, setMonth] = useState<MonthKey>(currentMonth())
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)

  const months = knownMonths(data, currentMonth())

  /** New transactions default to today, or to the 1st of a non-current month. */
  const defaultDate = month === currentMonth() ? today() : `${month}-01`

  const openNew = () => setEditing('new')

  if (status !== 'ready') {
    return <Gate status={status} error={error} onRetry={retry} />
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">
            <span className="brand-mark" aria-hidden="true">S</span>
            <span className="wordmark">Spendly</span>
          </span>
          <nav className="tabs">
            {SCREENS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="tab"
                aria-current={screen === item.id ? 'page' : undefined}
                onClick={() => setScreen(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <span className="topbar-spacer" />
          <MonthSwitcher month={month} months={months} onChange={setMonth} />
          <button
            type="button"
            className="button button-primary hide-mobile"
            onClick={openNew}
          >
            Əlavə et
          </button>
          <AccountButton onOpen={() => setProfileOpen(true)} />
        </div>
      </header>

      {!syncMessageDismissed && (
        <SyncBanner sync={sync} onRetry={syncNow} onDismiss={dismissSyncMessage} />
      )}

      <main className="shell">
        {screen === 'dashboard' && (
          <Dashboard
            data={data}
            month={month}
            onSelectTransaction={setEditing}
            onAdd={openNew}
          />
        )}
        {screen === 'transactions' && (
          <Transactions
            data={data}
            month={month}
            onSelect={setEditing}
            onAdd={openNew}
          />
        )}
        {screen === 'budget' && <Budget data={data} month={month} />}
        {screen === 'advice' && <Advice data={data} month={month} />}
      </main>

      <button type="button" className="fab" onClick={openNew} aria-label="Əməliyyat əlavə et">
        +
      </button>

      {profileOpen && <ProfileDialog onClose={() => setProfileOpen(false)} />}

      {editing !== null && (
        <TransactionDialog
          transaction={editing === 'new' ? null : editing}
          defaultDate={defaultDate}
          onSave={(values) => {
            if (editing === 'new') {
              addTransaction(values)
            } else {
              updateTransaction(editing.id, values)
            }
            // Follow the money: if it landed in another month, switch to it so
            // the user sees the effect of what they just saved.
            setMonth(monthOf(values.date))
            setEditing(null)
          }}
          onDelete={
            editing === 'new'
              ? undefined
              : () => {
                  removeTransaction(editing.id)
                  setEditing(null)
                }
          }
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}


/**
 * The way into the profile. It shows the account's initial when there is one
 * and a neutral mark otherwise, so local-storage mode still has somewhere to
 * see what is stored.
 */
function AccountButton({ onOpen }: { onOpen: () => void }) {
  const { status, user } = useAuth()
  const initial = user?.email?.slice(0, 1).toUpperCase() ?? '·'

  return (
    <button
      type="button"
      className="account-button"
      onClick={onOpen}
      aria-label="Profil"
      title={status === 'signed-in' ? (user?.email ?? 'Profil') : 'Profil'}
    >
      {initial}
    </button>
  )
}

/**
 * Where this browser stands against the server.
 *
 * Three different things, and they must not be said in the same voice. Queued
 * work is not a failure — the edit is in this browser's own storage and will
 * go out on its own — so it gets a quiet line and no alarm. A rejection from
 * the server is a failure, needs a person, and says which step fixes it.
 * Everything in order says nothing at all.
 */
function SyncBanner({
  sync,
  onRetry,
  onDismiss,
}: {
  sync: SyncState
  onRetry: () => void
  onDismiss: () => void
}) {
  if (sync.status === 'synced') return null

  if (sync.status === 'pending' || sync.status === 'offline') {
    return (
      <div className="sync-banner" role="status">
        <div className="sync-banner-inner">
          <span className="sync-banner-text">
            {sync.status === 'pending'
              ? 'Dəyişikliklər bu brauzerdə saxlanılıb, sinxronizasiya gözləyir.'
              : 'Oflayn rejim — məlumatlar bu brauzerdən oxunur.'}
          </span>
          <button type="button" className="button button-quiet" onClick={onRetry}>
            İndi göndər
          </button>
        </div>
      </div>
    )
  }

  const message = sync.message ?? ''
  const hint = setupHint(message)

  /* The headline already says the write did not land. Repeating a generic
     message underneath it says it twice and adds nothing, so only a hint or a
     message that actually carries detail is shown. */
  const guidance = hint ?? (message.trim() === '' ? null : message)

  return (
    <div className="save-banner" role="alert">
      <div className="save-banner-inner">
        <span className="save-banner-text">
          <strong>Server dəyişikliyi qəbul etmədi.</strong>{' '}
          {guidance && <>{guidance} </>}
          Dəyişiklik bu brauzerdə saxlanılıb.
        </span>
        {/* The raw error, when a hint stood in for it. */}
        {hint && message.trim() !== '' && (
          <span className="save-banner-detail">{message}</span>
        )}
        <button
          type="button"
          className="icon-button"
          onClick={onDismiss}
          aria-label="Bağla"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

/** Shown while the first load is in flight, or when it failed. */
function Gate({
  status,
  error,
  onRetry,
}: {
  status: 'loading' | 'error'
  error: string | null
  onRetry: () => void
}) {
  const hint = setupHint(error)

  return (
    <div className="gate">
      <span className="brand">
        <span className="brand-mark" aria-hidden="true">S</span>
        <span className="wordmark">Spendly</span>
      </span>
      {status === 'loading' ? (
        <p className="gate-text">Məlumatlarınız yüklənir…</p>
      ) : (
        <>
          <p className="gate-text">{hint ?? error ?? 'Məlumatlarınızı yükləmək mümkün olmadı.'}</p>
          {hint && error && <p className="gate-detail">{error}</p>}
          <button type="button" className="button" onClick={onRetry}>
            Yenidən cəhd et
          </button>
        </>
      )}
    </div>
  )
}
