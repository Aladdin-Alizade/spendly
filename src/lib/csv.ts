/**
 * Spreadsheet interchange for the transaction log.
 *
 * The product started as a sheet, and a sheet is still how some people move
 * a history between tools. Import never overwrites: a row that already exists
 * (same date, amount and description) is skipped, and a category the file
 * names but the account does not yet have is created rather than rejected.
 */

import { addCategory } from './categories'
import { isValidDate, nowISO } from './dates'
import { parseAmount, round2 } from './money'
import type { FinanceData, RepeatKind, Transaction, TransactionType } from './types'
import { isRepeatKind } from './types'

export interface CsvTransactionRow {
  date: string
  type: TransactionType
  category: string
  description: string
  amount: number
  note?: string
  repeats?: RepeatKind
}

export interface CsvParseResult {
  rows: CsvTransactionRow[]
  errors: string[]
}

export interface CsvImportResult {
  data: FinanceData
  added: number
  skipped: number
  categoriesCreated: number
}

export interface CsvImportSummary {
  added: number
  skipped: number
  categoriesCreated: number
  errors: string[]
}

const BOM = '\uFEFF'
const EXPORT_HEADERS = ['tarix', 'tip', 'kateqoriya', 'təsvir', 'məbləğ', 'qeyd', 'təkrar']

type Column = 'date' | 'type' | 'category' | 'description' | 'amount' | 'note' | 'repeats'

const HEADER_ALIASES: Record<string, Column> = {
  tarix: 'date',
  date: 'date',
  tip: 'type',
  type: 'type',
  növ: 'type',
  nov: 'type',
  kateqoriya: 'category',
  category: 'category',
  təsvir: 'description',
  tesvir: 'description',
  description: 'description',
  məbləğ: 'amount',
  mebleg: 'amount',
  amount: 'amount',
  qeyd: 'note',
  note: 'note',
  təkrar: 'repeats',
  tekrar: 'repeats',
  repeats: 'repeats',
}

function foldedHeader(value: string): string {
  return value.trim().toLocaleLowerCase('az')
}

function parseType(value: string): TransactionType | null {
  const v = foldedHeader(value)
  if (v === 'expense' || v === 'xərc' || v === 'xerc') return 'expense'
  if (v === 'income' || v === 'gəlir' || v === 'gelir') return 'income'
  return null
}

function parseRepeats(value: string): RepeatKind | undefined {
  const v = foldedHeader(value)
  if (!v) return undefined
  if (v === 'monthly' || v === 'aylıq' || v === 'ayliq') return 'monthly'
  return undefined
}

function csvEscape(value: string): string {
  if (/[",\r\n;]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function typeLabel(type: TransactionType): string {
  return type === 'income' ? 'gəlir' : 'xərc'
}

function amountCell(amount: number): string {
  return round2(amount).toFixed(2)
}

function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === delimiter) {
      cells.push(cell)
      cell = ''
    } else {
      cell += ch
    }
  }
  cells.push(cell)
  return cells
}

function countUnquoted(line: string, needle: string): number {
  let count = 0
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        i += 1
      } else {
        quoted = !quoted
      }
    } else if (!quoted && ch === needle) {
      count += 1
    }
  }
  return count
}

function detectDelimiter(headerLine: string): string {
  const commas = countUnquoted(headerLine, ',')
  const semis = countUnquoted(headerLine, ';')
  return semis > commas ? ';' : ','
}

function duplicateKey(date: string, amount: number, description: string): string {
  return `${date}\0${round2(amount)}\0${description.trim()}`
}

export function exportTransactionsCsv(transactions: Transaction[]): string {
  const lines = [EXPORT_HEADERS.join(',')]
  for (const item of transactions) {
    lines.push(
      [
        item.date,
        typeLabel(item.type),
        item.category,
        item.description,
        amountCell(item.amount),
        item.note ?? '',
        item.repeats === 'monthly' ? 'monthly' : '',
      ]
        .map(csvEscape)
        .join(','),
    )
  }
  return `${BOM}${lines.join('\r\n')}\r\n`
}

export function parseTransactionsCsv(
  text: string,
  dateOverride?: string,
): CsvParseResult {
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rawLines = source.split('\n')
  const lines = rawLines.map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => line.trim() !== '')

  if (lines.length === 0) {
    return { rows: [], errors: ['Faylda əməliyyat yoxdur.'] }
  }

  const delimiter = detectDelimiter(lines[0].line)
  const headerCells = splitLine(lines[0].line, delimiter).map(foldedHeader)
  const columns = headerCells.map((cell) => HEADER_ALIASES[cell])
  const indexOf = (column: Column) => columns.indexOf(column)

  const dateAt = indexOf('date')
  const typeAt = indexOf('type')
  const categoryAt = indexOf('category')
  const descriptionAt = indexOf('description')
  const amountAt = indexOf('amount')
  const noteAt = indexOf('note')
  const repeatsAt = indexOf('repeats')

  const stamp = dateOverride?.trim() || undefined
  if (stamp !== undefined && !isValidDate(stamp)) {
    return { rows: [], errors: ['Belə tarix yoxdur.'] }
  }

  if (
    typeAt < 0 ||
    categoryAt < 0 ||
    descriptionAt < 0 ||
    amountAt < 0 ||
    (stamp === undefined && dateAt < 0)
  ) {
    return {
      rows: [],
      errors: [
        stamp === undefined
          ? 'İlk sətirdə sütun adları olmalıdır (tarix, tip, kateqoriya, təsvir, məbləğ).'
          : 'İlk sətirdə sütun adları olmalıdır (tip, kateqoriya, təsvir, məbləğ).',
      ],
    }
  }

  const rows: CsvTransactionRow[] = []
  const errors: string[] = []

  for (const { line, number } of lines.slice(1)) {
    const cells = splitLine(line, delimiter)
    if (cells.every((cell) => cell.trim() === '')) continue

    const fileDate = dateAt >= 0 ? (cells[dateAt] ?? '').trim() : ''
    const date = stamp ?? fileDate
    const type = parseType(cells[typeAt] ?? '')
    const category = (cells[categoryAt] ?? '').trim()
    const description = (cells[descriptionAt] ?? '').trim()
    const amountRaw = cells[amountAt] ?? ''
    const note = noteAt >= 0 ? (cells[noteAt] ?? '').trim() : ''
    const repeats = repeatsAt >= 0 ? parseRepeats(cells[repeatsAt] ?? '') : undefined

    const problems: string[] = []
    if (stamp === undefined) {
      if (!date) problems.push('tarix seçin')
      else if (!isValidDate(date)) problems.push('belə tarix yoxdur')
    }
    if (!type) problems.push('tip xərc və ya gəlir olmalıdır')
    if (!category) problems.push('kateqoriya seçin')
    if (!description) problems.push('qısa təsvir yazın')
    const amount = parseAmount(amountRaw)
    if (amount === null) problems.push('məbləği daxil edin')
    else if (amount <= 0) problems.push('məbləğ sıfırdan böyük olmalıdır')

    if (problems.length > 0 || !type || amount === null) {
      errors.push(`Sətir ${number}: ${problems[0] ?? 'sətir oxunmadı'}.`)
      continue
    }

    rows.push({
      date,
      type,
      category,
      description,
      amount,
      note: note || undefined,
      repeats: isRepeatKind(repeats) ? repeats : undefined,
    })
  }

  return { rows, errors }
}

export function applyCsvImport(
  data: FinanceData,
  rows: CsvTransactionRow[],
  nextId: () => string,
): CsvImportResult {
  const seen = new Set(
    data.transactions.map((item) => duplicateKey(item.date, item.amount, item.description)),
  )

  let next = data
  let added = 0
  let skipped = 0
  let categoriesCreated = 0

  for (const row of rows) {
    const key = duplicateKey(row.date, row.amount, row.description)
    if (seen.has(key)) {
      skipped += 1
      continue
    }
    seen.add(key)

    const hasCategory = next.categories.some(
      (category) => category.name === row.category && category.type === row.type,
    )
    if (!hasCategory) {
      next = addCategory(next, {
        id: nextId(),
        name: row.category,
        type: row.type,
      })
      categoriesCreated += 1
    }

    const transaction: Transaction = {
      id: nextId(),
      date: row.date,
      type: row.type,
      category: row.category,
      description: row.description,
      amount: round2(row.amount),
      note: row.note,
      repeats: row.repeats,
      recordedAt: nowISO(),
    }
    next = { ...next, transactions: [...next.transactions, transaction] }
    added += 1
  }

  return { data: next, added, skipped, categoriesCreated }
}

export function importTransactionsFromCsv(
  data: FinanceData,
  text: string,
  nextId: () => string,
  dateOverride?: string,
): CsvImportSummary & { data: FinanceData } {
  const parsed = parseTransactionsCsv(text, dateOverride)
  if (parsed.rows.length === 0) {
    return {
      data,
      added: 0,
      skipped: 0,
      categoriesCreated: 0,
      errors: parsed.errors.length > 0 ? parsed.errors : ['Faylda əməliyyat yoxdur.'],
    }
  }
  const applied = applyCsvImport(data, parsed.rows, nextId)
  return { ...applied, errors: parsed.errors }
}

export function csvImportNotice(result: CsvImportSummary): string {
  const parts: string[] = []
  if (result.added > 0) parts.push(`${result.added} əməliyyat əlavə olundu`)
  if (result.skipped > 0) parts.push(`${result.skipped} dublikat keçildi`)
  if (result.categoriesCreated > 0) {
    parts.push(`${result.categoriesCreated} kateqoriya yaradıldı`)
  }
  if (parts.length === 0) {
    return result.errors[0] ?? 'Faylda əməliyyat yoxdur.'
  }
  const first = parts[0]
  const rest = parts.slice(1)
  let text = rest.length > 0 ? `${first}, ${rest.join(', ')}.` : `${first}.`
  if (result.errors.length > 0) text += ' Bəzi sətirlər oxunmadı.'
  return text.charAt(0).toUpperCase() + text.slice(1)
}
