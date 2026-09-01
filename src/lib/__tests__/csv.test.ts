import { describe, expect, it } from 'vitest'
import {
  applyCsvImport,
  csvImportNotice,
  exportTransactionsCsv,
  parseTransactionsCsv,
} from '../csv'
import { emptyData } from '../storage'
import type { Transaction } from '../types'

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    date: '2025-10-05',
    type: 'expense',
    category: 'Ərzaq',
    description: 'Market',
    amount: 12.5,
    ...over,
  }
}

let n = 0
const nextId = () => {
  n += 1
  return `n${n}`
}

describe('transaction csv', () => {
  it('round-trips a row, including a monthly flag', () => {
    const csv = exportTransactionsCsv([
      tx({ note: 'Lidl', repeats: 'monthly' }),
    ])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    const parsed = parseTransactionsCsv(csv)
    expect(parsed.errors).toEqual([])
    expect(parsed.rows).toEqual([
      {
        date: '2025-10-05',
        type: 'expense',
        category: 'Ərzaq',
        description: 'Market',
        amount: 12.5,
        note: 'Lidl',
        repeats: 'monthly',
      },
    ])
  })

  it('reads English headers and types', () => {
    const parsed = parseTransactionsCsv(
      'date,type,category,description,amount,note\n2025-10-05,expense,Ərzaq,Market,12.50,\n',
    )
    expect(parsed.rows[0]?.type).toBe('expense')
    expect(parsed.rows[0]?.amount).toBe(12.5)
  })

  it('reads a semicolon sheet the way Excel in this locale writes one', () => {
    const parsed = parseTransactionsCsv(
      'tarix;tip;kateqoriya;təsvir;məbləğ\n2025-10-05;gəlir;Maaş;Oktyabr maaşı;990\n',
    )
    expect(parsed.rows[0]).toMatchObject({
      type: 'income',
      category: 'Maaş',
      amount: 990,
    })
  })

  it('skips a duplicate date+amount+description and creates a missing category', () => {
    n = 0
    const existing = {
      ...emptyData,
      transactions: [tx()],
      categories: [],
    }
    const parsed = parseTransactionsCsv(
      [
        'tarix,tip,kateqoriya,təsvir,məbləğ',
        '2025-10-05,xərc,Ərzaq,Market,12.50',
        '2025-10-06,xərc,Nəqliyyat,Metro,1.00',
      ].join('\n'),
    )
    const result = applyCsvImport(existing, parsed.rows, nextId)
    expect(result.skipped).toBe(1)
    expect(result.added).toBe(1)
    expect(result.categoriesCreated).toBe(1)
    expect(result.data.categories.map((c) => c.name)).toEqual(['Nəqliyyat'])
  })

  it('reports a bad row without dropping the good ones', () => {
    const parsed = parseTransactionsCsv(
      'tarix,tip,kateqoriya,təsvir,məbləğ\n2025-10-05,xərc,Ərzaq,Market,12.50\nnot-a-date,xərc,Ərzaq,Market,1\n',
    )
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.errors[0]).toMatch(/Sətir 3/)
  })

  it('writes the import notice in the user\'s language', () => {
    expect(
      csvImportNotice({ added: 2, skipped: 1, categoriesCreated: 1, errors: [] }),
    ).toBe('2 əməliyyat əlavə olundu, 1 dublikat keçildi, 1 kateqoriya yaradıldı.')
  })

  it('stamps every row with a chosen date, even when the file date is unreadable', () => {
    const parsed = parseTransactionsCsv(
      'tarix,tip,kateqoriya,təsvir,məbləğ\nnot-a-date,xərc,Ərzaq,Market,12.50\n',
      '2025-11-02',
    )
    expect(parsed.errors).toEqual([])
    expect(parsed.rows[0]?.date).toBe('2025-11-02')
  })

  it('lets the date column go when a date was chosen', () => {
    const parsed = parseTransactionsCsv(
      'tip,kateqoriya,təsvir,məbləğ\nxərc,Ərzaq,Market,12.50\n',
      '2025-11-02',
    )
    expect(parsed.rows[0]).toMatchObject({
      date: '2025-11-02',
      description: 'Market',
      amount: 12.5,
    })
  })
})
