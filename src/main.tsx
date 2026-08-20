import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AuthScreen } from './components/AuthScreen'
import { RecoveryScreen } from './components/RecoveryScreen'
import { AuthProvider, useAuth } from './store/AuthProvider'
import { FinanceProvider } from './store/FinanceProvider'
import { LocalStorageRepository } from './lib/storage'
import { SupabaseRepository } from './lib/supabaseRepository'
import { SyncingRepository } from './lib/syncingRepository'
import { isSupabaseConfigured } from './lib/supabase'
import './styles.css'

/**
 * This browser's own storage always; Supabase on top of it when a project is
 * configured, so an edit is saved before anything is asked of the network.
 * Nothing below the repository knows which one it got.
 */
function Root() {
  const { status, userId, recovering } = useAuth()

  if (status === 'loading') {
    return (
      <div className="gate">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span className="wordmark">Spendly</span>
        </span>
        <p className="gate-text">Yoxlanılır…</p>
      </div>
    )
  }

  if (status === 'signed-out') return <AuthScreen />

  /* A reset link signs the user in, so this has to come before the app: the
     password they followed the link to set is still unset. */
  if (recovering) return <RecoveryScreen />

  /*
   * Keyed by user so signing into a different account remounts the store
   * rather than leaving the previous account's figures on screen while the
   * new ones load.
   */
  return (
    <FinanceProvider
      key={userId ?? 'local'}
      repository={
        isSupabaseConfigured
          ? // The snapshots belong to the account, not to the browser: one key
            // per account is what stops one account's rows being handed to the
            // next one to sign in here and uploaded as its own.
            new SyncingRepository(new SupabaseRepository(userId), userId)
          : new LocalStorageRepository()
      }
    >
      <App />
    </FinanceProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </StrictMode>,
)
