import { useState } from 'react'
import { EmptyState, Section } from '../components/primitives'
import { BudgetLineDialog } from '../components/BudgetLineDialog'
import { IncomePlanDialog } from '../components/IncomePlanDialog'
import { CategoryDialog } from '../components/CategoryDialog'
import { categoriesOfType, categoryUsage, plannedIncomeRows } from '../lib/categories'
import { formatAZN, formatSignedAZN } from '../lib/money'
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
    clearMonthPlan,
    resetAll,
  } = useFinance()
  const [editing, setEditing] = useState<BudgetLine | 'new' | null>(null)
  const [editingIncome, setEditingIncome] = useState(false)
  const [editingCategory, setEditingCategory] = useState<
    { category: CategoryDef | null; type: TransactionType } | null
  >(null)

  const groups = budgetGroups(data, month)
  const summary = summarise(data, month)
  const plan = data.incomePlans.find((entry) => entry.month === month)
  const incomeCategories = categoriesOfType(data, 'income')
  const incomeRows = plannedIncomeRows(incomeCategories, plan?.amounts ?? {})
  // Carrying the plan over needs a plan to carry. With no earlier month there
  // is nothing to copy, so the offer is not made.
  const hasPriorPlan = data.budgetLines.some((line) => line.month < month)

  return (
    <>
      <Section
        title="Planlaşdırılan gəlir"
        action={
          <button
            type="button"
            className="button button-quiet"
            onClick={() => setEditingIncome(true)}
          >
            Dəyiş
          </button>
        }
      >
        <div className="card rows">
          {incomeRows.map((row) => (
            <PlanRow
              key={row.category}
              label={row.category}
              value={row.planned}
              note={row.orphaned ? 'kateqoriya silinib' : undefined}
            />
          ))}
          {incomeRows.length === 0 && (
            <p className="rows-more">
              Hələ gəlir kateqoriyası yoxdur. Aşağıdan əlavə edin.
            </p>
          )}
          <PlanRow label="Cəmi" value={summary.plannedIncome} strong />
        </div>
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

      <Section title="Planlaşdırılan qalıq">
        <div className="card" style={{ padding: '16px' }}>
          <p
            className={`num${summary.plannedRemainder < 0 ? ' neg' : ''}`}
            style={{ fontSize: 24, fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}
          >
            {formatSignedAZN(summary.plannedRemainder)}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            planlaşdırılan gəlir {formatAZN(summary.plannedIncome)} −{' '}
            planlaşdırılan xərc {formatAZN(summary.plannedExpenses)}
            {summary.plannedRemainder < 0 && ' · bu plan qazancdan çox xərcləyir'}
          </p>
        </div>
      </Section>

      <DangerZone
        month={month}
        hasPlan={groups.some((group) => group.lines.length > 0)}
        transactionCount={data.transactions.length}
        onClearPlan={() => clearMonthPlan(month)}
        onResetAll={resetAll}
      />

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
        <IncomePlanDialog
          rows={incomeRows}
          amounts={plan?.amounts ?? {}}
          onSave={(amounts) => {
            setIncomePlan(month, amounts)
            setEditingIncome(false)
          }}
          onClose={() => setEditingIncome(false)}
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

function PlanRow({
  label,
  value,
  note,
  strong = false,
}: {
  label: string
  value: number
  /** Why this line is unusual — currently only ever "the category is gone". */
  note?: string
  strong?: boolean
}) {
  return (
    <div
      className="row"
      style={{ cursor: 'default', fontWeight: strong ? 600 : undefined }}
    >
      <span className="row-main">
        <span className="row-title" style={{ fontWeight: strong ? 600 : 500 }}>
          {label}
        </span>
        {note && <span className="row-meta">{note}</span>}
      </span>
      <span className="row-amount num">{formatAZN(value)}</span>
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
  onClearPlan,
  onResetAll,
}: {
  month: MonthKey
  hasPlan: boolean
  transactionCount: number
  onClearPlan: () => void
  onResetAll: () => void
}) {
  const [confirming, setConfirming] = useState<'plan' | 'all' | null>(null)

  if (!hasPlan && transactionCount === 0) return null

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
