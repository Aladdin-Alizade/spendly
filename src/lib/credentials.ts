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
 * Setting a new password after a reset link.
 *
 * There is no current password to ask for here — the link out of the mailbox
 * is what stands in for it, which is the whole point of the flow.
 */
export function validateNewPassword(
  next: string,
  repeat: string,
): Pick<PasswordChangeErrors, 'next' | 'repeat'> {
  const errors: Pick<PasswordChangeErrors, 'next' | 'repeat'> = {}

  if (next === '') {
    errors.next = 'Yeni şifrəni daxil edin'
  } else if (next.length < MIN_PASSWORD_LENGTH) {
    errors.next = `Yeni şifrə ən azı ${MIN_PASSWORD_LENGTH} simvol olmalıdır`
  }

  if (repeat !== next) {
    errors.repeat = 'Şifrələr uyğun gəlmir'
  }

  return errors
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
  if (/expired|invalid token|invalid jwt|otp_expired|link is invalid/i.test(message)) {
    return 'Link vaxtı keçib və ya artıq istifadə olunub. Yenidən sıfırlama tələb edin.'
  }
  /*
   * Supabase's built-in mail service allows a handful of messages an hour,
   * and it counts sign-up confirmations, reset links and everything else
   * together. Calling that "too many attempts" blames the person for typing
   * their password once — the limit is on the mail, not on them.
   */
  if (/email rate limit|over_email_send_rate_limit/i.test(message)) {
    return (
      'Supabase-in e-poçt limiti dolub — pulsuz xidmət saatda yalnız bir neçə ' +
      'məktub göndərir. Bir saat gözləyin, təsdiqi söndürün, və ya öz SMTP-nizi qoşun.'
    )
  }

  const wait = /you can only request this after (\d+) seconds?/i.exec(message)
  if (wait) {
    return `Növbəti cəhd üçün ${wait[1]} saniyə gözləmək lazımdır.`
  }

  if (/rate limit|too many requests/i.test(message)) {
    return 'Çox sayda sorğu göndərilib. Bir az gözləyin.'
  }
  if (/signups not allowed|signup is disabled/i.test(message)) {
    return 'Qeydiyyat Supabase panelində bağlıdır (Authentication → Sign In / Providers).'
  }
  return message
}
