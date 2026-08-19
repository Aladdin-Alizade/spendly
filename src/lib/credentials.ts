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
  if (/rate limit|too many requests/i.test(message)) {
    return 'Çox sayda cəhd oldu. Bir az gözləyin.'
  }
  if (/signups not allowed|signup is disabled/i.test(message)) {
    return 'Qeydiyyat Supabase panelində bağlıdır (Authentication → Sign In / Providers).'
  }
  return message
}
