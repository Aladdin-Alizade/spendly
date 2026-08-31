import { isValidDate } from './dates'
import { parseAmount } from './money'
import type { TransactionType } from './types'

export interface TransactionInput {
  date: string
  type: TransactionType
  category: string
  description: string
  amount: string
  note: string
  /** Form flag; stored as `repeats: 'monthly'` when true. */
  repeats: boolean
}

export type FieldErrors = Partial<Record<keyof TransactionInput, string>>

/** Largest amount accepted, so a mistyped figure cannot corrupt the history. */
const MAX_AMOUNT = 100_000_000

/**
 * `allowed` is the user's own category list for the chosen type. It is passed
 * in rather than read from a constant because categories are editable now, and
 * a validator working from a stale hard-coded list would reject a category the
 * user had just created.
 */
export function validateTransaction(
  input: TransactionInput,
  allowed: readonly string[],
): FieldErrors {
  const errors: FieldErrors = {}

  if (!input.date.trim()) {
    errors.date = 'Tarix seçin'
  } else if (!isValidDate(input.date)) {
    errors.date = 'Belə tarix yoxdur'
  }

  if (!input.description.trim()) {
    errors.description = 'Qısa təsvir yazın'
  }

  if (!allowed.includes(input.category)) {
    errors.category = 'Kateqoriya seçin'
  }

  const amount = parseAmount(input.amount)
  if (amount === null) {
    errors.amount = 'Məbləği daxil edin'
  } else if (amount <= 0) {
    // The sheet only ever holds positive figures; direction comes from the type.
    errors.amount = 'Məbləğ sıfırdan böyük olmalıdır'
  } else if (amount > MAX_AMOUNT) {
    errors.amount = 'Bu məbləğ həddindən artıq böyükdür'
  }

  return errors
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0
}
