import { useState } from 'react'
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '../lib/credentials'
import { useAuth } from '../store/AuthProvider'

/**
 * Setting the password a reset link was opened to set.
 *
 * The link signs the user in, so without this screen they would land on the
 * dashboard with the thing they came to do still undone — and the link is
 * single-use, so they would have to ask for another one to try again.
 *
 * There is no current-password field: the link out of the mailbox is what
 * stands in for it.
 */
export function RecoveryScreen() {
  const { completePasswordReset, signOut } = useAuth()
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const errors = validateNewPassword(next, repeat)
  const visible = showErrors ? errors : {}

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setFailure(null)
    if (errors.next || errors.repeat) {
      setShowErrors(true)
      return
    }

    setBusy(true)
    try {
      await completePasswordReset(next)
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : 'Alınmadı')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <form className="auth-card card" onSubmit={submit} noValidate>
        <div className="auth-head">
          <span className="brand">
            <span className="brand-mark" aria-hidden="true">S</span>
            <span className="wordmark">Spendly</span>
          </span>
          <p className="auth-lead">Yeni şifrənizi təyin edin.</p>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="rec-next">
            Yeni şifrə
          </label>
          <input
            id="rec-next"
            className="input"
            type="password"
            autoComplete="new-password"
            value={next}
            aria-invalid={Boolean(visible.next)}
            onChange={(event) => setNext(event.target.value)}
          />
          {visible.next ? (
            <p className="field-error">{visible.next}</p>
          ) : (
            <p className="field-hint">Ən azı {MIN_PASSWORD_LENGTH} simvol.</p>
          )}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="rec-repeat">
            Yeni şifrə (təkrar)
          </label>
          <input
            id="rec-repeat"
            className="input"
            type="password"
            autoComplete="new-password"
            value={repeat}
            aria-invalid={Boolean(visible.repeat)}
            onChange={(event) => setRepeat(event.target.value)}
          />
          {visible.repeat && <p className="field-error">{visible.repeat}</p>}
        </div>

        {failure && <p className="auth-failure">{failure}</p>}

        <button type="submit" className="button button-primary auth-submit" disabled={busy}>
          {busy ? 'Gözləyin…' : 'Şifrəni təyin et'}
        </button>

        <p className="auth-switch">
          <button type="button" onClick={() => void signOut()}>
            Ləğv et və çıx
          </button>
        </p>
      </form>
    </div>
  )
}
