import { describe, expect, it } from 'vitest'
import {
  authErrorMessage,
  hasCredentialErrors,
  hasPasswordChangeErrors,
  validateCredentials,
  validateNewPassword,
  validatePasswordChange,
  MIN_PASSWORD_LENGTH,
} from '../credentials'

const valid = { email: 'a@b.com', password: 'correct-horse' }

describe('validateCredentials', () => {
  it('accepts a well-formed pair in both modes', () => {
    expect(hasCredentialErrors(validateCredentials(valid, 'sign-in'))).toBe(false)
    expect(hasCredentialErrors(validateCredentials(valid, 'sign-up'))).toBe(false)
  })

  it('requires both fields', () => {
    const errors = validateCredentials({ email: '', password: '' }, 'sign-in')
    expect(Object.keys(errors).sort()).toEqual(['email', 'password'])
  })

  it('rejects an address that is not one', () => {
    expect(validateCredentials({ ...valid, email: 'not-an-email' }, 'sign-in').email)
      .toBeDefined()
    expect(validateCredentials({ ...valid, email: 'a@b' }, 'sign-in').email).toBeDefined()
    expect(validateCredentials({ ...valid, email: ' a@b.com ' }, 'sign-in').email)
      .toBeUndefined()
  })

  it('enforces the password length only when creating an account', () => {
    const short = { ...valid, password: 'x'.repeat(MIN_PASSWORD_LENGTH - 1) }
    expect(validateCredentials(short, 'sign-up').password).toBeDefined()
    // An existing password predating this rule still has to be able to sign in.
    expect(validateCredentials(short, 'sign-in').password).toBeUndefined()
  })
})

describe('authErrorMessage', () => {
  it('translates the errors a user actually hits', () => {
    expect(authErrorMessage('Invalid login credentials')).toMatch(/yanlışdır/)
    expect(authErrorMessage('User already registered')).toMatch(/artıq var/)
    expect(authErrorMessage('Email not confirmed')).toMatch(/təsdiqlənməyib/)
    expect(authErrorMessage('Signups not allowed for this instance')).toMatch(/Qeydiyyat/)
  })

  it('passes an unrecognised message through rather than hiding it', () => {
    expect(authErrorMessage('some unmapped failure')).toBe('some unmapped failure')
  })
})

describe('validatePasswordChange', () => {
  const valid = { current: 'old-one', next: 'brand-new', repeat: 'brand-new' }

  it('accepts a well-formed change', () => {
    expect(hasPasswordChangeErrors(validatePasswordChange(valid))).toBe(false)
  })

  it('asks for the current password rather than trusting the session', () => {
    // An unattended browser has a session too; a session alone should not be
    // enough to lock somebody out of their own account.
    expect(validatePasswordChange({ ...valid, current: '' }).current).toBeDefined()
  })

  it('holds the new password to the same length rule as sign-up', () => {
    const short = 'x'.repeat(MIN_PASSWORD_LENGTH - 1)
    expect(
      validatePasswordChange({ ...valid, next: short, repeat: short }).next,
    ).toBeDefined()
  })

  it('rejects a new password identical to the old one', () => {
    expect(
      validatePasswordChange({ current: 'same-one', next: 'same-one', repeat: 'same-one' })
        .next,
    ).toBeDefined()
  })

  it('catches a mistyped repeat', () => {
    expect(validatePasswordChange({ ...valid, repeat: 'brand-neW' }).repeat).toBeDefined()
  })
})

describe('validateNewPassword', () => {
  it('accepts a matching pair that is long enough', () => {
    const errors = validateNewPassword('brand-new', 'brand-new')
    expect(errors.next).toBeUndefined()
    expect(errors.repeat).toBeUndefined()
  })

  it('holds it to the same length rule as everywhere else', () => {
    const short = 'x'.repeat(MIN_PASSWORD_LENGTH - 1)
    expect(validateNewPassword(short, short).next).toBeDefined()
  })

  it('catches a mistyped repeat', () => {
    expect(validateNewPassword('brand-new', 'brand-neW').repeat).toBeDefined()
  })

  it('asks for no current password — the link is what stands in for it', () => {
    expect(Object.keys(validateNewPassword('brand-new', 'brand-new'))).toEqual([])
  })
})

describe('reset link failures', () => {
  it('says a spent or expired link is spent, and what to do', () => {
    expect(authErrorMessage('Email link is invalid or has expired')).toMatch(
      /Yenidən sıfırlama/,
    )
  })
})

describe('rate limits', () => {
  it('names the mail quota rather than blaming the attempt', () => {
    // Supabase counts sign-up confirmations and reset links against one small
    // hourly quota; "too many attempts" blames somebody for typing their
    // password once.
    const message = authErrorMessage('email rate limit exceeded')
    expect(message).toMatch(/e-poçt limiti/)
    expect(message).not.toMatch(/cəhd oldu/)
  })

  it('passes on how long the server said to wait', () => {
    expect(
      authErrorMessage('For security purposes, you can only request this after 47 seconds.'),
    ).toMatch(/47 saniyə/)
  })
})

describe('a link that no longer works', () => {
  it('says so, rather than passing on a JWT complaint', () => {
    // What the server says is "invalid number of segments"; what happened is
    // that the link was already used or has expired.
    expect(
      authErrorMessage('invalid JWT: unable to parse or verify signature'),
    ).toMatch(/Link vaxtı keçib/)
  })
})
