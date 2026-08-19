import { useState } from 'react'
import { MonthSwitcher } from './components/MonthSwitcher'
import { TransactionDialog } from './components/TransactionDialog'
import { Dashboard } from './screens/Dashboard'
import { Transactions } from './screens/Transactions'
import { Budget } from './screens/Budget'
import { knownMonths } from './lib/calc'
import { currentMonth, monthOf, today } from './lib/dates'
import { useFinance } from './store/FinanceProvider'
import { useAuth } from './store/AuthProvider'
import { setupHint } from './lib/setupHints'
import type { MonthKey, Transaction } from './lib/types'

type Screen = 'dashboard' | 'transactions' | 'budget'

const SCREENS: { id: Screen; label: string }[] = [
  { id: 'dashboard', label: 'İcmal' },
  { id: 'transactions', label: 'Əməliyyatlar' },
  { id: 'budget', label: 'Büdcə' },
]

export function App() {
  const {
    data,
    status,
    error,
    saveError,
    dismissSaveError,
    retry,
    addTransaction,
    updateTransaction,
    removeTransaction,
  } = useFinance()
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [month, setMonth] = useState<MonthKey>(currentMonth())
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null)

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
          <SignOutButton />
        </div>
      </header>

      {saveError !== null && (
        <SaveBanner message={saveError} onDismiss={dismissSaveError} />
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
      </main>

      <button type="button" className="fab" onClick={openNew} aria-label="Əməliyyat əlavə et">
        +
      </button>

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


/** Present only when there is an account to leave; in local-storage mode
 *  there is nobody signed in. */
function SignOutButton() {
  const { status, signOut } = useAuth()
  if (status !== 'signed-in') return null

  return (
    <button
      type="button"
      className="button button-quiet hide-mobile"
      onClick={() => void signOut()}
    >
      Çıxış
    </button>
  )
}

/**
 * A write did not reach the backend.
 *
 * The edit is still on screen because local state accepted it, which is
 * exactly why this has to be said out loud — otherwise an unsaved figure is
 * indistinguishable from a saved one until the page is reloaded and it is
 * gone.
 */
function SaveBanner({
  message,
  onDismiss,
}: {
  message: string
  onDismiss: () => void
}) {
  const hint = setupHint(message)

  /* The headline already says the write failed. Repeating a generic message
     underneath it says it twice and adds nothing, so only a hint or a message
     that actually carries detail is shown. */
  const guidance = hint ?? (message.trim() === '' ? null : message)

  return (
    <div className="save-banner" role="alert">
      <div className="save-banner-inner">
        <span className="save-banner-text">
          <strong>Dəyişiklik yadda saxlanılmadı.</strong>{' '}
          {guidance && <>{guidance} </>}
          Səhifəni yeniləsəniz, son dəyişiklik itəcək.
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
