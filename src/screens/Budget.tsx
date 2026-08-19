import { useState } from 'react'
import { EmptyState, Section } from '../components/primitives'
import { BudgetLineDialog } from '../components/BudgetLineDialog'
import { PlannedAmountsDialog } from '../components/PlannedAmountsDialog'
import { CategoryDialog } from '../components/CategoryDialog'
import { categoriesOfType, categoryUsage, plannedIncomeRows } from '../lib/categories'
import { plannedSavingsRows } from '../lib/savings'
import { formatAZN, formatSignedAZN, round2 } from '../lib/money'
import { formatMonth } from '../lib/dates'
import { budgetGroups, summarise } from '../lib/calc'
import { useFinance } from '../store/FinanceProvider'
import type {
  BudgetLine,
  CategoryDef,
  FinanceData,
  MonthKey,
  TransactionType,
} from '../lib/types'

/**
 * The 'Aylıq rasxod' plan for one month, plus the planned income rows from
 * 'BÜDCƏ İCMALI'!C11:C12. Actual figures are derived, never typed.
 */
export function Budget({ data, month }: { data: FinanceData; month: MonthKey }) {
  const {
    applyTemplate,
    upsertBudgetLine,
    removeBudgetLine,
    setIncomePlan,
    setSavingsPlan,
    clearMonthPlan,
    resetAll,
  } = useFinance()
  const [editing, setEditing] = useState<BudgetLine | 'new' | null>(null)
  const [editingIncome, setEditingIncome] = useState(false)
  const [editingSavings, setEditingSavings] = useState(false)
  /* An account with no categories cannot plan anything yet, and the thing it
     needs is on the other side of this switch — so that is where it opens. */
  const [view, setView] = useState<'plan' | 'setup'>(
    data.categories.length === 0 ? 'setup' : 'plan',
  )
  const [editingCategory, setEditingCategory] = useState<
    { category: CategoryDef | null; type: TransactionType } | null
  >(null)

  const groups = budgetGroups(data, month)
  const summary = summarise(data, month)
  const plan = data.incomePlans.find((entry) => entry.month === month)
  const incomeCategories = categoriesOfType(data, 'income')
  const incomeRows = plannedIncomeRows(incomeCategories, plan?.amounts ?? {})
  const savingsPlan = data.savingsPlans.find((entry) => entry.month === month)
  const savingsRows = plannedSavingsRows(data.savingsPots, savingsPlan?.amounts ?? {})
  // Carrying the plan over needs a plan to carry. With no earlier month there
  // is nothing to copy, so the offer is not made.
  const hasPriorPlan = data.budgetLines.some((line) => line.month < month)

  /* The sheet's own remainder is planned income minus planned spending, and
     `summary.plannedRemainder` stays exactly that. What the month actually has
     free is that figure less what it means to put away, so when there is a
     savings plan the card shows the free amount and says it is the free one. */
  const hasSavingsPlan = summary.plannedSavings > 0
  const plannedLeft = hasSavingsPlan
    ? round2(summary.plannedRemainder - summary.plannedSavings)
    : summary.plannedRemainder

  return (
    <>
      {/* Two things live on this screen: the month, which changes every
          month, and the setup behind it, which somebody writes once and
          rarely touches. Stacking them made the second scroll past on the
          way to the first every single time. */}
      <div className="segmented budget-switch" role="group" aria-label="Görünüş">
        <button
          type="button"
          className="segment"
          aria-pressed={view === 'plan'}
          onClick={() => setView('plan')}
        >
          Plan
        </button>
        <button
          type="button"
          className="segment"
          aria-pressed={view === 'setup'}
          onClick={() => setView('setup')}
        >
          Quraşdırma
        </button>
      </div>

      {view === 'plan' ? (
        <>

          {/* The month on one card: what was planned, and what actually
              happened, side by side. It replaces three stacked sections that
              between them carried four numbers — on a phone that was 672px of
              headings and padding to read four figures. */}
          <Section title={`${formatMonth(month)} planı`}>
            <div className="card plan-summary">
              <button
                type="button"
                className="plan-cell plan-cell-editable"
                onClick={() => setEditingIncome(true)}
              >
                <span className="micro">Gəlir</span>
                <span className="plan-cell-value num">
                  {formatAZN(summary.plannedIncome)}
                </span>
                <span className="plan-cell-actual num">
                  faktiki {formatAZN(summary.actualIncome)}
                </span>
              </button>

              {/* Planned spending is the sum of the lines below, so there is
                  nothing to edit here — the lines are the edit. */}
              <div className="plan-cell">
                <span className="micro">Xərc</span>
                <span className="plan-cell-value num">
                  {formatAZN(summary.plannedExpenses)}
                </span>
                <span className="plan-cell-actual num">
                  faktiki {formatAZN(summary.actualExpenses)}
                </span>
              </div>

              <button
                type="button"
                className="plan-cell plan-cell-editable"
                onClick={() => setEditingSavings(true)}
                disabled={data.savingsPots.length === 0}
              >
                <span className="micro">Yığım</span>
                <span className="plan-cell-value num">
                  {formatAZN(summary.plannedSavings)}
                </span>
                <span className="plan-cell-actual num">
                  {data.savingsPots.length === 0
                    ? 'qab yoxdur'
                    : `faktiki ${formatAZN(summary.actualSavings)}`}
                </span>
              </button>

              <div className="plan-cell plan-cell-total">
                <span className="micro">{hasSavingsPlan ? 'Sərbəst qalıq' : 'Qalıq'}</span>
                <span className={`plan-cell-value num${plannedLeft < 0 ? ' neg' : ''}`}>
                  {formatSignedAZN(plannedLeft)}
                </span>
                <span className="plan-cell-actual num">
                  faktiki {formatSignedAZN(summary.actualRemainder)}
                </span>
              </div>
            </div>

            <p className="section-foot">
              planlaşdırılan gəlir {formatAZN(summary.plannedIncome)} − xərc{' '}
              {formatAZN(summary.plannedExpenses)}
              {hasSavingsPlan && <> − yığım {formatAZN(summary.plannedSavings)}</>}{' '}
              = {formatSignedAZN(plannedLeft)}
              {plannedLeft < 0 && ' — bu plan qazancdan çox xərcləyir'}
              {'.'}
              {hasSavingsPlan && summary.actualSavings < summary.plannedSavings && (
                <>
                  {' '}Yığım planına çatmaq üçün{' '}
                  {formatAZN(summary.plannedSavings - summary.actualSavings)} qalıb.
                </>
              )}
            </p>
          </Section>

          <Section
            title="Planlaşdırılan xərclər"
            action={
              groups.length > 0 ? (
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => setEditing('new')}
                >
                  Sətir əlavə et
                </button>
              ) : undefined
            }
          >
            {groups.length === 0 ? (
              <div className="card">
                <EmptyState
                  title={`${formatMonth(month)} üçün plan yoxdur`}
                  body={
                    hasPriorPlan
                      ? 'Keçən ayın planını köçürün və ya sıfırdan başlayın.'
                      : 'Planlaşdırdığınız xərcləri sətir-sətir əlavə edin.'
                  }
                  action={
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                      {hasPriorPlan && (
                        <button
                          type="button"
                          className="button button-primary"
                          onClick={() => applyTemplate(month)}
                        >
                          Planı köçür
                        </button>
                      )}
                      <button
                        type="button"
                        className={hasPriorPlan ? 'button' : 'button button-primary'}
                        onClick={() => setEditing('new')}
                      >
                        Sətir əlavə et
                      </button>
                    </div>
                  }
                />
              </div>
            ) : (
              <div className="card rows">
                <div className="budget-head">
                  <span>Kateqoriya</span>
                  <span className="budget-cell-num">Plan</span>
                  <span className="budget-cell-num">Faktiki</span>
                  <span className="budget-cell-num budget-variance">Qalıq</span>
                </div>

                {groups.map((group) => (
                  <div key={group.category}>
                    <div className="budget-group">
                      <span className="budget-group-name">{group.category}</span>
                      <span className="budget-cell-num num">
                        {formatAZN(group.planned)}
                      </span>
                      <span
                        className="budget-cell-num num"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {formatAZN(group.actual)}
                      </span>
                      <span
                        className={`budget-cell-num num budget-variance${
                          group.variance < 0 ? ' neg' : ''
                        }`}
                      >
                        {formatSignedAZN(group.variance)}
                      </span>
                    </div>

                    {group.lines.map((line) => (
                      <button
                        key={line.id}
                        type="button"
                        className="budget-line row"
                        onClick={() => setEditing(line)}
                      >
                        <span className="budget-line-name">{line.description}</span>
                        <span className="budget-cell-num num">
                          {formatAZN(line.planned)}
                        </span>
                      </button>
                    ))}

                    {group.lines.length === 0 && (
                      <p className="budget-line budget-line-empty">
                        Planlaşdırılmadan xərclənib
                      </p>
                    )}
                  </div>
                ))}

                <div className="budget-group budget-total">
                  <span>Cəmi</span>
                  <span className="budget-cell-num num">
                    {formatAZN(summary.plannedExpenses)}
                  </span>
                  <span className="budget-cell-num num">
                    {formatAZN(summary.actualExpenses)}
                  </span>
                  <span
                    className={`budget-cell-num num budget-variance${
                      summary.plannedExpenses - summary.actualExpenses < 0 ? ' neg' : ''
                    }`}
                  >
                    {formatSignedAZN(summary.plannedExpenses - summary.actualExpenses)}
                  </span>
                </div>
              </div>
            )}
          </Section>

        </>
      ) : (
        <>

          <Section
            title="Kateqoriyalar"
            action={
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setEditingCategory({ category: null, type: 'expense' })}
              >
                Əlavə et
              </button>
            }
          >
            <div className="category-columns">
              <CategoryList
                data={data}
                type="expense"
                title="Xərc"
                onSelect={(category) => setEditingCategory({ category, type: 'expense' })}
                onAdd={() => setEditingCategory({ category: null, type: 'expense' })}
              />
              <CategoryList
                data={data}
                type="income"
                title="Gəlir"
                onSelect={(category) => setEditingCategory({ category, type: 'income' })}
                onAdd={() => setEditingCategory({ category: null, type: 'income' })}
              />
            </div>
          </Section>

          <DangerZone
            month={month}
            hasPlan={groups.some((group) => group.lines.length > 0)}
            transactionCount={data.transactions.length}
            savingsCount={data.savingsEntries.length}
            onClearPlan={() => clearMonthPlan(month)}
            onResetAll={resetAll}
          />
        </>
      )}


      {editing !== null && (
        <BudgetLineDialog
          line={editing === 'new' ? null : editing}
          onSave={(values) => {
            upsertBudgetLine({
              ...values,
              month,
              id: editing === 'new' ? undefined : editing.id,
            })
            setEditing(null)
          }}
          onDelete={
            editing === 'new'
              ? undefined
              : () => {
                  removeBudgetLine(editing.id)
                  setEditing(null)
                }
          }
          onClose={() => setEditing(null)}
        />
      )}

      {editingCategory && (
        <CategoryDialog
          category={editingCategory.category}
          type={editingCategory.type}
          onClose={() => setEditingCategory(null)}
        />
      )}

      {editingIncome && (
        <PlannedAmountsDialog
          title="Planlaşdırılan gəlir"
          emptyText="Hələ gəlir kateqoriyası yoxdur. Aşağıdakı Kateqoriyalar bölməsindən əlavə edin."
          idPrefix="ip"
          rows={incomeRows.map((row) => ({
            name: row.category,
            orphaned: row.orphaned,
          }))}
          amounts={plan?.amounts ?? {}}
          onSave={(amounts) => {
            setIncomePlan(month, amounts)
            setEditingIncome(false)
          }}
          onClose={() => setEditingIncome(false)}
        />
      )}

      {editingSavings && (
        <PlannedAmountsDialog
          title="Planlaşdırılan yığım"
          emptyText="Hələ yığım qabı yoxdur. Yığım səhifəsindən əlavə edin."
          idPrefix="sp"
          rows={savingsRows.map((row) => ({ name: row.pot, orphaned: row.orphaned }))}
          amounts={savingsPlan?.amounts ?? {}}
          onSave={(amounts) => {
            setSavingsPlan(month, amounts)
            setEditingSavings(false)
          }}
          onClose={() => setEditingSavings(false)}
        />
      )}
    </>
  )
}

/**
 * One side of the ledger's categories, each with what depends on it. The usage
 * count is shown because it is what decides whether a category can simply be
 * removed or has to be moved somewhere first.
 */
function CategoryList({
  data,
  type,
  title,
  onSelect,
  onAdd,
}: {
  data: FinanceData
  type: TransactionType
  title: string
  onSelect: (category: CategoryDef) => void
  onAdd: () => void
}) {
  const categories = categoriesOfType(data, type)

  return (
    <div className="card rows">
      <p className="rows-caption">{title}</p>

      {categories.map((category) => {
        const usage = categoryUsage(data, category.name)
        const total = usage.transactions + usage.budgetLines

        return (
          <button
            type="button"
            className="row"
            key={category.id}
            onClick={() => onSelect(category)}
          >
            <span className="row-main">
              <span className="row-title">{category.name}</span>
              <span className="row-meta">
                {total === 0
                  ? 'istifadə olunmur'
                  : [
                      usage.transactions > 0 && `${usage.transactions} əməliyyat`,
                      usage.budgetLines > 0 && `${usage.budgetLines} büdcə sətri`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </span>
            </span>
            <span className="category-edit">Dəyiş</span>
          </button>
        )
      })}

      {categories.length === 0 && (
        <p className="rows-more">Hələ kateqoriya yoxdur.</p>
      )}

      <button type="button" className="row category-add" onClick={onAdd}>
        <span className="row-main">
          <span className="row-title">+ Kateqoriya əlavə et</span>
        </span>
      </button>
    </div>
  )
}

/**
 * Bulk deletion. Kept at the very bottom, visually quiet, and every action
 * needs a second click — these remove data that cannot be recovered.
 */
function DangerZone({
  month,
  hasPlan,
  transactionCount,
  savingsCount,
  onClearPlan,
  onResetAll,
}: {
  month: MonthKey
  hasPlan: boolean
  transactionCount: number
  savingsCount: number
  onClearPlan: () => void
  onResetAll: () => void
}) {
  const [confirming, setConfirming] = useState<'plan' | 'all' | null>(null)

  if (!hasPlan && transactionCount === 0 && savingsCount === 0) return null

  return (
    <Section title="Silmə">
      <div className="card danger">
        {hasPlan && (
          <div className="danger-row">
            <span className="danger-text">
              <span className="row-title">{formatMonth(month)} planını sil</span>
              <span className="row-meta">
                Yalnız bu ayın planlaşdırılan sətirləri silinir, əməliyyatlara
                toxunulmur.
              </span>
            </span>
            <button
              type="button"
              className="button button-danger"
              onClick={() => {
                if (confirming === 'plan') {
                  onClearPlan()
                  setConfirming(null)
                } else {
                  setConfirming('plan')
                }
              }}
            >
              {confirming === 'plan' ? 'Təsdiqlə' : 'Planı sil'}
            </button>
          </div>
        )}

        <div className="danger-row">
          <span className="danger-text">
            <span className="row-title">Bütün məlumatları sil</span>
            <span className="row-meta">
              {transactionCount} əməliyyat və bütün aylar üzrə planlar həmişəlik
              silinir.
              {savingsCount > 0 &&
                ` ${savingsCount} yığım qeydi də gedir — qabların adları qalır, içindəkilər sıfırlanır.`}
            </span>
          </span>
          <button
            type="button"
            className="button button-danger"
            onClick={() => {
              if (confirming === 'all') {
                onResetAll()
                setConfirming(null)
              } else {
                setConfirming('all')
              }
            }}
          >
            {confirming === 'all' ? 'Hər şeyi sil' : 'Hamısını sil'}
          </button>
        </div>
      </div>
    </Section>
  )
}
