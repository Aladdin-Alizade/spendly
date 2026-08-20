/**
 * Money handling. All amounts are AZN and are rounded to 2 decimals at every
 * boundary so that repeated addition can never drift (0.1 + 0.2 problems).
 */

/**
 * Round to 2 decimals, half-away-from-zero, avoiding float representation
 * error.
 *
 * The nudge is applied after the scaling, not before it. `Number.EPSILON` is
 * the gap between 1 and the next double, so adding it to a figure larger than
 * 1 changes nothing at all — and 8.165, which is stored as a hair under
 * 8.165, rounded down to 8.16 while the Android app rounded it to 8.17. The
 * two apps read one account, so a figure that rounds differently on each is
 * two answers to the same question.
 */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0
  const scaled = Math.round(Math.abs(value) * 100 + 1e-9) / 100
  return value < 0 ? -scaled : scaled
}

/** Sum a list of amounts without accumulating float error. */
export function sum(values: number[]): number {
  return round2(values.reduce((total, value) => total + value, 0))
}

const formatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** `1,250.00 ₼` — mirrors the sheet's `#,##0.00 [$₼-42C]` cell format. */
export function formatAZN(value: number): string {
  const rounded = round2(value)
  // Guard against "-0.00".
  const safe = Object.is(rounded, -0) ? 0 : rounded
  return `${formatter.format(safe)} ₼`
}

/** Same as formatAZN but with an explicit leading `+` for positive values. */
export function formatSignedAZN(value: number): string {
  const rounded = round2(value)
  return rounded > 0 ? `+${formatAZN(rounded)}` : formatAZN(rounded)
}

/**
 * Parse user input into an amount.
 * Accepts `1234.56`, `1 234,56`, `1,234.56`. Returns null when unparseable.
 */
export function parseAmount(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === '') return null

  // Strip spaces and the currency mark, then normalise the decimal separator.
  let normalised = trimmed.replace(/[\s ₼]/g, '')
  const lastComma = normalised.lastIndexOf(',')
  const lastDot = normalised.lastIndexOf('.')
  if (lastComma > -1 && lastComma > lastDot) {
    normalised = normalised.replace(/\./g, '').replace(',', '.')
  } else {
    normalised = normalised.replace(/,/g, '')
  }

  if (!/^-?\d*\.?\d*$/.test(normalised) || normalised === '' || normalised === '.') {
    return null
  }
  const value = Number(normalised)
  return Number.isFinite(value) ? round2(value) : null
}
