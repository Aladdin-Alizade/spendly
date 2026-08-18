import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { FinanceProvider } from './store/FinanceProvider'
import { LocalStorageRepository } from './lib/storage'
import { SupabaseRepository } from './lib/supabaseRepository'
import { isSupabaseConfigured } from './lib/supabase'
import './styles.css'

/**
 * Supabase when it is configured, this browser's own storage otherwise.
 * Nothing above this line knows which one it got.
 */
const repository = isSupabaseConfigured
  ? new SupabaseRepository()
  : new LocalStorageRepository()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FinanceProvider repository={repository}>
      <App />
    </FinanceProvider>
  </StrictMode>,
)
