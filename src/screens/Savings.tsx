import { useState } from 'react'
import { EmptyState, Meter, Section } from '../components/primitives'
import { SavingsEntryDialog } from '../components/SavingsEntryDialog'
import { SavingsPotDialog } from '../components/SavingsPotDialog'
import { formatAZN } from '../lib/money'
import { formatDayShort, formatMonth } from '../lib/dates'
import {
  convertibleSavingTransactions,
  depositedFromIncome,
  depositedFromOutside,
  entriesInMonth,
  potRows,
  savingsBalance,
} from '../lib/savings'
import { spendableBalance, totalHoldings } from '../lib/calc'
import { useFinance } from '../store/FinanceProvider'
import type { FinanceData, MonthKey, SavingsEntry, SavingsPot } from '../lib/types'

/**
 * The third flow.
 *
 * Money set aside is neither spending nor income, and this screen is where it
 * gets to say so: what is in each pot, what went in this month and where it
 * came from. The figures at the top exist to make one point that the balance
 * on the dashboard cannot make on its own — the money you cannot spend is
 * still money you have.
 */
export function Savings({
  data,
  month,
  defaultDate,
}: {
  data: FinanceData
  month: MonthKey
  defaultDate: string
}) {
  const { convertSavingsFromTransactions } = useFinance()
  const [editingPot, setEditingPot] = useState<SavingsPot | 'new' | null>(null)
  const [editingEntry, setEditingEntry] = useState<SavingsEntry | 'new' | null>(null)
  const [newEntryPot, setNewEntryPot] = useState<string | undefined>(undefined)
  const [showAll, setShowAll] = useState(false)

  /* Every figure is as of the end of the month in the header. The rule is the
     app's, not this screen's: what you are looking at is the month you chose,
     everywhere. A balance that ignored it would disagree with İcmal. */
  const rows = potRows(data, month)
  const saved = savingsBalance(data.savingsEntries, month)
  const spendable = spendableBalance(data, month)
  const total = totalHoldings(data, month)
  const fromIncome = depositedFromIncome(data.savingsEntries, month)
  const fromOutside = depositedFromOutside(data.savingsEntries, month)
  const monthEntries = entriesInMonth(data.savingsEntries, month)
  const allEntries = [...data.savingsEntries]
    .filter((entry) => entry.date.slice(0, 7) <= month)
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
  const listed = showAll ? allEntries : monthEntries

  const convertible = convertibleSavingTransactions(data)

  const openEntry = (pot?: string) => {
    setNewEntryPot(pot)
    setEditingEntry('new')
  }

  return (
    <>
      {/* Savings recorded the old way, before pots existed. Offered rather
          than applied: it deletes transactions, and that is not a decision to
          make on somebody's behalf while they are looking elsewhere. */}
      {convertible.transactions.length > 0 && (
        <div className="card notice">
          <p className="notice-text">
            <strong>{convertible.transactions.length} əməliyyat</strong> yığım
            kimi işarələnmiş kateqoriyalarda xərc kimi yazılıb — cəmi{' '}
            {formatAZN(convertible.total)}. Bunları qab hərəkətinə çevirsək,
            həmin pul xərc sayılmaqdan çıxar və yığım balansınıza keçər.
            Kateqoriya adları qab adı olacaq: {convertible.pots.join(', ')}.
          </p>
          <button
            type="button"
            className="button button-primary"
            onClick={convertSavingsFromTransactions}
          >
            Yığıma köçür
          </button>
        </div>
      )}

      <Section title={`Harada dayanırsınız — ${formatMonth(month)} sonuna`}>
        <div className="card holdings">
          <div className="holding">
            <span className="micro">Xərcləyə bilən</span>
            <span className={`holding-value num${spendable < 0 ? ' neg' : ''}`}>
              {formatAZN(spendable)}
            </span>
          </div>
          <div className="holding">
            <span className="micro">Yığım</span>
            <span className="holding-value num">{formatAZN(saved)}</span>
          </div>
          <div className="holding holding-total">
            <span className="micro">Cəmi</span>
            <span className={`holding-value num${total < 0 ? ' neg' : ''}`}>
              {formatAZN(total)}
            </span>
          </div>
        </div>
        <p className="section-foot">
          {formatMonth(month)}: gəlirdən {formatAZN(fromIncome)} kənara qoyulub
          {fromOutside > 0 && `, kənardan ${formatAZN(fromOutside)} gəlib`}.
          {/* The explanation earns its place only when there is outside money
              on screen to explain; otherwise it is a paragraph about nothing. */}
          {fromOutside > 0 &&
            ' Kənardan gələn pul gəlir hesabatlarınıza düşmür — o, heç vaxt xərcləyə biləcəyiniz tərəfdə olmayıb.'}
        </p>
      </Section>

      <Section
        title="Qablar"
        action={
          <div className="section-actions">
            {/* These are the screen's real work, not asides, so they carry a
                button's weight — the quiet style reads as a label here. */}
            <button
              type="button"
              className="button"
              onClick={() => setEditingPot('new')}
            >
              Qab əlavə et
            </button>
            {rows.length > 0 && (
              <button
                type="button"
                className="button button-primary"
                onClick={() => openEntry()}
              >
                Qoy / götür
              </button>
            )}
          </div>
        }
      >
        {rows.length === 0 ? (
          <div className="card">
            <EmptyState
              title="Hələ qab yoxdur"
              body="Bir hədəf adlandırın — ehtiyat fondu, avtomobil, nə olursa. Sonra ora qoyduğunuz hər məbləği qeyd edərsiniz."
              action={
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => setEditingPot('new')}
                >
                  Qab əlavə et
                </button>
              }
            />
          </div>
        ) : (
          <div className="pots">
            {rows.map((row) => (
              <div key={row.name} className="card pot">
                <div className="pot-head">
                  <button
                    type="button"
                    className="pot-name"
                    disabled={row.orphaned}
                    onClick={() => row.pot && setEditingPot(row.pot)}
                  >
                    {row.name}
                    {row.orphaned && <span className="pot-tag">silinib</span>}
                  </button>
                  <span className="pot-balance num">{formatAZN(row.balance)}</span>
                </div>

                {row.target !== undefined && row.progress !== null ? (
                  <>
                    <Meter value={row.balance} max={row.target} />
                    <p className="pot-foot">
                      hədəfin {Math.round(row.progress * 100)}%-i ·{' '}
                      {formatAZN(row.target)} hədəf
                      {/* At zero the remaining amount is the target again, and
                          saying the same figure twice reads as a mistake. */}
                      {row.balance > 0 &&
                        row.balance < row.target &&
                        ` · ${formatAZN(row.target - row.balance)} qalıb`}
                    </p>
                  </>
                ) : (
                  <p className="pot-foot">
                    {row.entries} qeyd · hədəf təyin edilməyib
                  </p>
                )}

                {!row.orphaned && (
                  <button
                    type="button"
                    className="button pot-action"
                    onClick={() => openEntry(row.name)}
                  >
                    Bu qaba qoy / götür
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Hərəkətlər"
        action={
          allEntries.length > monthEntries.length ? (
            <button
              type="button"
              className="button button-quiet"
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? formatMonth(month) : 'Bu aya qədər hamısı'}
            </button>
          ) : undefined
        }
      >
        {listed.length === 0 ? (
          <div className="card">
            <EmptyState
              title={`${formatMonth(month)} üçün hərəkət yoxdur`}
              body="Kənara qoyduğunuz və ya qabdan götürdüyünüz hər məbləği burada qeyd edin."
            />
          </div>
        ) : (
          <div className="card rows">
            {listed.map((entry) => {
              const deposit = entry.direction === 'in'
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="row"
                  onClick={() => setEditingEntry(entry)}
                >
                  <span className="row-date">{formatDayShort(entry.date)}</span>
                  <span className="row-main">
                    <span className="row-title">{entry.pot}</span>
                    <span className="row-meta">
                      {deposit
                        ? entry.source === 'external'
                          ? 'kənardan'
                          : 'gəlirdən'
                        : 'götürüldü'}
                      {entry.note ? ` · ${entry.note}` : ''}
                    </span>
                  </span>
                  <span className={`row-amount${deposit ? ' pos' : ''}`}>
                    {deposit ? '+' : '−'}
                    {formatAZN(entry.amount)}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </Section>

      {editingPot !== null && (
        <SavingsPotDialog
          pot={editingPot === 'new' ? null : editingPot}
          onClose={() => setEditingPot(null)}
        />
      )}

      {editingEntry !== null && (
        <SavingsEntryDialog
          entry={editingEntry === 'new' ? null : editingEntry}
          defaultDate={defaultDate}
          defaultPot={editingEntry === 'new' ? newEntryPot : undefined}
          onClose={() => setEditingEntry(null)}
        />
      )}
    </>
  )
}
