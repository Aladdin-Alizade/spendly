/**
 * Sign-in form validation.
 *
 * Deliberately thin: the only checks here are the ones that can be made
 * without asking the server, so the form can answer instantly and the server
 * stays the authority on everything else (address already taken, wrong
 * password, a stricter password policy).
 */

export interface CredentialInput {
  email: string
  password: string
}

export type CredentialErrors = Partial<Record<keyof CredentialInput, string>>

/**
 * Supabase rejects anything shorter than six characters by default, so the
 * form says so before a round trip rather than after one.
 * https://supabase.com/docs/guides/auth/passwords
 */
export const MIN_PASSWORD_LENGTH = 6

/** Deliberately loose: an address is either accepted by the server or it is
 *  not, and a strict pattern here only ever rejects valid addresses. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateCredentials(
  input: CredentialInput,
  mode: 'sign-in' | 'sign-up',
): CredentialErrors {
  const errors: CredentialErrors = {}

  const email = input.email.trim()
  if (email === '') {
    errors.email = 'E-poçt ünvanını daxil edin'
  } else if (!EMAIL.test(email)) {
    errors.email = 'E-poçt ünvanı düzgün deyil'
  }

  if (input.password === '') {
    errors.password = 'Şifrəni daxil edin'
  } else if (mode === 'sign-up' && input.password.length < MIN_PASSWORD_LENGTH) {
    // Only on sign-up: an existing password that predates this rule must still
    // be able to sign in.
    errors.password = `Şifrə ən azı ${MIN_PASSWORD_LENGTH} simvol olmalıdır`
  }

  return errors
}

export function hasCredentialErrors(errors: CredentialErrors): boolean {
  return Object.keys(errors).length > 0
}

export interface PasswordChangeInput {
  current: string
  next: string
  repeat: string
}

export type PasswordChangeErrors = Partial<Record<keyof PasswordChangeInput, string>>

/**
 * Changing a password, checked as far as it can be without the server.
 *
 * The current password is asked for rather than taken on trust from the open
 * session: an unattended browser is the ordinary case, and a session alone
 * should not be enough to lock its owner out of their own account. The server
 * is what actually verifies it — this only catches the empty field.
 */
export function validatePasswordChange(
  input: PasswordChangeInput,
): PasswordChangeErrors {
  const errors: PasswordChangeErrors = {}

  if (input.current === '') {
    errors.current = 'Cari şifrəni daxil edin'
  }

  if (input.next === '') {
    errors.next = 'Yeni şifrəni daxil edin'
  } else if (input.next.length < MIN_PASSWORD_LENGTH) {
    errors.next = `Yeni şifrə ən azı ${MIN_PASSWORD_LENGTH} simvol olmalıdır`
  } else if (input.next === input.current) {
    errors.next = 'Yeni şifrə köhnəsindən fərqli olmalıdır'
  }

  if (input.repeat !== input.next) {
    errors.repeat = 'Şifrələr uyğun gəlmir'
  }

  return errors
}

export function hasPasswordChangeErrors(errors: PasswordChangeErrors): boolean {
  return Object.keys(errors).length > 0
}

/**
 * Supabase's auth errors, in the user's language. Anything unrecognised is
 * passed through rather than replaced with a vague sentence.
 */
export function authErrorMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return 'E-poçt və ya şifrə yanlışdır'
  }
  if (/user already registered|already exists/i.test(message)) {
    return 'Bu e-poçt ünvanı ilə hesab artıq var — daxil olun'
  }
  if (/email not confirmed/i.test(message)) {
    return 'E-poçt ünvanı təsdiqlənməyib. Gələn məktubdakı linki açın.'
  }
  if (/password should be at least/i.test(message)) {
    return `Şifrə ən azı ${MIN_PASSWORD_LENGTH} simvol olmalıdır`
  }
  if (/new password should be different|same as the old password/i.test(message)) {
    return 'Yeni şifrə köhnəsindən fərqli olmalıdır'
  }
  if (/rate limit|too many requests/i.test(message)) {
    return 'Çox sayda cəhd oldu. Bir az gözləyin.'
  }
  if (/signups not allowed|signup is disabled/i.test(message)) {
    return 'Qeydiyyat Supabase panelində bağlıdır (Authentication → Sign In / Providers).'
  }
  return message
}
