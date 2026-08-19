import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AuthScreen } from './components/AuthScreen'
import { AuthProvider, useAuth } from './store/AuthProvider'
import { FinanceProvider } from './store/FinanceProvider'
import { LocalStorageRepository } from './lib/storage'
import { SupabaseRepository } from './lib/supabaseRepository'
import { isSupabaseConfigured } from './lib/supabase'
import './styles.css'

/**
 * Supabase when it is configured, this browser's own storage otherwise.
 * Nothing below the repository knows which one it got.
 */
function Root() {
  const { status, userId } = useAuth()

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

  /*
   * Keyed by user so signing into a different account remounts the store
   * rather than leaving the previous account's figures on screen while the
   * new ones load.
   */
  return (
    <FinanceProvider
      key={userId ?? 'local'}
      repository={
        isSupabaseConfigured ? new SupabaseRepository() : new LocalStorageRepository()
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
