import type { DateKey, MonthKey } from './types'

const MONTH_NAMES = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun',
  'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr',
]

/**
 * Written out rather than sliced from the full names: the first three letters
 * of İyun and İyul are both "İyu", which would make June and July identical on
 * a chart axis.
 */
const MONTH_SHORT = [
  'Yan', 'Fev', 'Mar', 'Apr', 'May', 'İyn',
  'İyl', 'Avq', 'Sen', 'Okt', 'Noy', 'Dek',
]

/** Monday first, matching how the week is read here. */
const WEEKDAY_SHORT = ['B.e', 'Ç.a', 'Ç', 'C.a', 'C', 'Ş', 'B']

/** `YYYY-MM-DD` for today, in the user's local timezone (never UTC-shifted). */
export function today(): DateKey {
  const now = new Date()
  return toDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

export function toDateKey(year: number, month: number, day: number): DateKey {
  return `${year}-${pad(month)}-${pad(day)}`
}

export function currentMonth(): MonthKey {
  return today().slice(0, 7)
}

/** `2025-10-14` -> `2025-10`. */
export function monthOf(date: DateKey): MonthKey {
  return date.slice(0, 7)
}

/** Number of days in a month, e.g. `2024-02` -> 29. */
export function daysInMonth(month: MonthKey): number {
  const [year, monthIndex] = month.split('-').map(Number)
  return new Date(year, monthIndex, 0).getDate()
}

/** `2025-10` -> `Okt`. */
export function formatMonthShort(month: MonthKey): string {
  const monthIndex = Number(month.split('-')[1])
  return MONTH_SHORT[monthIndex - 1] ?? month
}

/** `2025-10` -> `Oktyabr 2025`. */
export function formatMonth(month: MonthKey): string {
  const [year, monthIndex] = month.split('-').map(Number)
  const name = MONTH_NAMES[monthIndex - 1]
  return name ? `${name} ${year}` : month
}

/** `2025-10-14` -> `14 Okt`. */
export function formatDayShort(date: DateKey): string {
  const [, month, day] = date.split('-').map(Number)
  const name = MONTH_SHORT[month - 1]
  return name ? `${day} ${name}` : date
}

/**
 * Day of the week, 0 = Monday.
 *
 * Built from the parts rather than `new Date(string)`, which parses a bare
 * `YYYY-MM-DD` as UTC and would report the wrong day west of Greenwich.
 */
export function weekdayOf(date: DateKey): number {
  const [year, month, day] = date.split('-').map(Number)
  return (new Date(year, month - 1, day).getDay() + 6) % 7
}

/** `0` -> `B.e`. */
export function formatWeekdayShort(weekday: number): string {
  return WEEKDAY_SHORT[weekday] ?? ''
}

/** Shift a month key by `delta` months. Handles year boundaries. */
export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [year, monthIndex] = month.split('-').map(Number)
  const zeroBased = (year * 12 + (monthIndex - 1)) + delta
  return `${Math.floor(zeroBased / 12)}-${pad((zeroBased % 12) + 1)}`
}

/**
 * Validate a `YYYY-MM-DD` string, rejecting both malformed strings and
 * calendar-impossible dates such as `2025-02-30`.
 */
export function isValidDate(value: string): value is DateKey {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (month < 1 || month > 12 || day < 1) return false
  const daysInMonth = new Date(year, month, 0).getDate()
  return day <= daysInMonth
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
