import { useState } from 'react'
import { MonthSwitcher } from './components/MonthSwitcher'
import { TransactionDialog } from './components/TransactionDialog'
import { SavingsEntryDialog } from './components/SavingsEntryDialog'
import { SavingsPotDialog } from './components/SavingsPotDialog'
import { ProfileDialog } from './components/ProfileDialog'
import { Dashboard } from './screens/Dashboard'
import { Transactions } from './screens/Transactions'
import { Budget } from './screens/Budget'
import { Savings } from './screens/Savings'
import { Advice } from './screens/Advice'
import { knownMonths } from './lib/calc'
import { currentMonth, monthOf, today } from './lib/dates'
import { useFinance } from './store/FinanceProvider'
import { useAuth } from './store/AuthProvider'
import { setupHint } from './lib/setupHints'
import type { SyncState } from './lib/syncingRepository'
import type { MonthKey, Transaction } from './lib/types'

type Screen = 'dashboard' | 'transactions' | 'budget' | 'savings' | 'advice'

const SCREENS: { id: Screen; label: string }[] = [
  { id: 'dashboard', label: 'İcmal' },
  { id: 'transactions', label: 'Əməliyyatlar' },
  { id: 'budget', label: 'Büdcə' },
  { id: 'savings', label: 'Yığım' },
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
  const [draft, setDraft] = useState<Omit<Transaction, 'id'> | null>(null)
  const [savingsDialog, setSavingsDialog] = useState<'entry' | 'pot' | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)

  const months = knownMonths(data, currentMonth())

  /** New transactions default to today, or to the 1st of a non-current month. */
  const defaultDate = month === currentMonth() ? today() : `${month}-01`

  /**
   * The add button records whatever the screen is about. On Yığım that is a
   * movement, not a transaction — and with no pot yet it is the pot itself,
   * because a movement has nowhere to go until one exists.
   */
  const openNew = () => {
    if (screen !== 'savings') {
      setDraft(null)
      setEditing('new')
      return
    }
    setSavingsDialog(data.savingsPots.length > 0 ? 'entry' : 'pot')
  }

  const closeEditor = () => {
    setEditing(null)
    setDraft(null)
  }

  const addLabel = screen === 'savings' ? 'Yığım hərəkəti əlavə et' : 'Əməliyyat əlavə et'

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
            onLogRepeat={(values) => {
              setDraft(values)
              setEditing('new')
            }}
          />
        )}
        {screen === 'budget' && <Budget data={data} month={month} />}
        {screen === 'savings' && (
          <Savings data={data} month={month} defaultDate={defaultDate} />
        )}
        {screen === 'advice' && <Advice data={data} month={month} />}
      </main>

      <button type="button" className="fab" onClick={openNew} aria-label={addLabel}>
        +
      </button>

      {savingsDialog === 'entry' && (
        <SavingsEntryDialog
          entry={null}
          defaultDate={defaultDate}
          onClose={() => setSavingsDialog(null)}
        />
      )}

      {savingsDialog === 'pot' && (
        <SavingsPotDialog pot={null} onClose={() => setSavingsDialog(null)} />
      )}

      {profileOpen && <ProfileDialog onClose={() => setProfileOpen(false)} />}

      {editing !== null && (
        <TransactionDialog
          transaction={editing === 'new' ? null : editing}
          defaultDate={defaultDate}
          defaults={editing === 'new' ? draft ?? undefined : undefined}
          onSave={(values) => {
            if (editing === 'new') {
              addTransaction(values)
            } else {
              updateTransaction(editing.id, values)
            }
            // Follow the money: if it landed in another month, switch to it so
            // the user sees the effect of what they just saved.
            setMonth(monthOf(values.date))
            closeEditor()
          }}
          onDelete={
            editing === 'new'
              ? undefined
              : () => {
                  removeTransaction(editing.id)
                  closeEditor()
                }
          }
          onClose={closeEditor}
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
 *
 * Across all three runs a fourth thing: whether the browser managed to keep
 * its own copy. Every one of these lines used to end by promising it had,
 * which on a full quota was the one sentence in the app that was not true —
 * and it was being said at exactly the moment it mattered most.
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
  if (sync.status === 'synced') {
    // Everything is on the server. The only thing left worth saying is that
    // this browser could not keep its own copy, which matters because the next
    // edit made offline has nowhere to go.
    if (sync.stored) return null
    return (
      <div className="sync-banner" role="status">
        <div className="sync-banner-inner">
          <span className="sync-banner-text">
            Dəyişiklik serverə göndərildi, amma bu brauzerdə nüsxə saxlanıla
            bilmədi — yaddaşda yer açın.
          </span>
        </div>
      </div>
    )
  }

  if (sync.status === 'pending' || sync.status === 'offline') {
    const queued =
      sync.status === 'pending'
        ? 'Dəyişikliklər bu brauzerdə saxlanılıb, sinxronizasiya gözləyir.'
        : 'Oflayn rejim — məlumatlar bu brauzerdən oxunur.'

    return (
      <div className="sync-banner" role="status">
        <div className="sync-banner-inner">
          <span className="sync-banner-text">
            {sync.stored
              ? queued
              : 'Dəyişiklik nə bu brauzerdə saxlanıla bildi, nə də göndərildi — yaddaşda yer açın.'}
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
        {/* Which failure this is decides the first sentence. Local-only mode
            has no server to refuse anything, so leading with one there would
            name a thing that is not in the picture. */}
        <span className="save-banner-text">
          <strong>
            {sync.stored
              ? 'Server dəyişikliyi qəbul etmədi.'
              : 'Dəyişiklik saxlanıla bilmədi.'}
          </strong>{' '}
          {guidance && <>{guidance} </>}
          {sync.stored && 'Dəyişiklik bu brauzerdə saxlanılıb.'}
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
