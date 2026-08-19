import { useMemo, useState } from 'react'
import { Panel } from '../components/primitives'
import { budgetAdvice } from '../lib/insights/advice'
import type { Advice, AdvicePriority } from '../lib/insights/advice'
import {
  METHODS,
  ORIGIN_LABEL,
  REVIEW_INTERVAL_MONTHS,
  methodsNeedingReview,
  needsReview,
} from '../lib/insights/methodology'
import { formatAZN, formatSignedAZN } from '../lib/money'
import { formatMonth, today } from '../lib/dates'
import type { FinanceData, MonthKey } from '../lib/types'

/**
 * Məsləhətlər — what the month's figures say, measured against published
 * budgeting practice.
 *
 * Everything here is produced by `budgetAdvice`, which is a set of rules that
 * either fire or do not. Nothing on this screen is generated text: the same
 * figures always produce the same page, which is what makes it something to
 * rely on rather than something to read.
 */
export function Advice({ data, month }: { data: FinanceData; month: MonthKey }) {
  const asOf = today()
  const report = useMemo(() => budgetAdvice(data, month, asOf), [data, month, asOf])
  const stale = useMemo(() => methodsNeedingReview(asOf), [asOf])

  const { health } = report
  const nothing =
    report.attention.length === 0 && report.good.length === 0 && report.review.length === 0

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Məsləhətlər</h1>
          <p className="page-sub">
            {formatMonth(month)} · yalnız rəqəmlərin təsdiqlədiyi müşahidələr
          </p>
        </div>
      </div>

      {stale.length > 0 && (
        <div className="review-banner" role="status">
          {stale.length} istinad {REVIEW_INTERVAL_MONTHS} aydan çoxdur
          yoxlanılmayıb. Aşağıdakı Metodologiya bölməsində tarixlər göstərilib —
          mənbələr dəyişmiş ola bilər.
        </div>
      )}

      <div className="grid">
        {/* --------------------------------------------------------- *
            Budget health — figures, not a score
         * --------------------------------------------------------- */}
        <Panel
          title="Büdcə vəziyyəti"
          span={12}
          note={<span className="panel-note">bal deyil — hesablanmış göstəricilər</span>}
        >
          <div className="health">
            <Figure label="Gəlir" value={formatAZN(health.income)} />
            <Figure label="Xərc" value={formatAZN(health.expenses)} />
            <Figure
              label="Qalan"
              value={formatSignedAZN(health.remaining)}
              tone={health.remaining < 0 ? 'neg' : health.remaining > 0 ? 'pos' : undefined}
            />
            <Figure
              label="Qalan pulun payı"
              value={
                health.retainedRate === null
                  ? '—'
                  : `${Math.round(health.retainedRate * 100)}%`
              }
              hint={health.retainedRate === null ? 'gəlir qeyd edilməyib' : undefined}
            />
            <Figure
              label="Plandan fərq"
              value={health.planVariance === null ? '—' : formatSignedAZN(health.planVariance)}
              tone={
                health.planVariance === null
                  ? undefined
                  : health.planVariance > 0
                    ? 'neg'
                    : 'pos'
              }
              hint={health.planVariance === null ? 'plan qurulmayıb' : undefined}
            />
          </div>

          {health.spendingRatio !== null && (
            <div className="health-bar">
              <div className="bar-track">
                <span
                  className={`bar-fill ${health.spendingRatio > 1 ? 'bar-fill-over' : 'bar-fill-out'}`}
                  style={{ width: `${Math.min(health.spendingRatio, 1) * 100}%` }}
                />
              </div>
              <p className="health-bar-note">
                Gəlirin {Math.round(health.spendingRatio * 100)}%-i xərclənib
                {health.spendingRatio > 1 && ' — gəlirdən çox'}
              </p>
            </div>
          )}
        </Panel>

        {nothing && (
          <Panel title="Müşahidə yoxdur" span={12}>
            <p className="advice-empty">
              Bu ay üçün rəqəmlərin təsdiqlədiyi müşahidə yoxdur. Əməliyyat və plan
              əlavə etdikcə burada müşahidələr görünəcək.
            </p>
          </Panel>
        )}

        <Bucket
          title="Diqqət tələb edir"
          priority="attention"
          items={report.attention}
          empty="Diqqət tələb edən hal aşkarlanmadı."
        />
        <Bucket
          title="Yaxşı gedir"
          priority="good"
          items={report.good}
          empty="Bu ay üçün müsbət müşahidə yoxdur."
        />
        <Bucket
          title="Nəzərdən keçirməyə dəyər"
          priority="review"
          items={report.review}
          empty="Nəzərdən keçirilməli hal yoxdur."
        />

        {/* --------------------------------------------------------- *
            What could not be said, and why
         * --------------------------------------------------------- */}
        {report.unavailable.length > 0 && (
          <Panel
            title="Hələ hesablana bilməyənlər"
            span={6}
            note={<span className="panel-note">{report.unavailable.length}</span>}
          >
            <ul className="reasons">
              {report.unavailable.map((entry, index) => (
                <li key={`${entry.method}-${index}`}>
                  <span className="reasons-name">{METHODS[entry.method]?.name}</span>
                  <span className="reasons-why">{entry.reason}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <Methodology asOf={asOf} span={report.unavailable.length > 0 ? 6 : 12} />
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */

function Figure({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: string
  tone?: 'pos' | 'neg'
  hint?: string
}) {
  return (
    <div className="health-figure">
      <p className="micro">{label}</p>
      <p className={`health-value num${tone ? ` ${tone}` : ''}`}>{value}</p>
      {hint && <p className="health-hint">{hint}</p>}
    </div>
  )
}

function Bucket({
  title,
  priority,
  items,
  empty,
}: {
  title: string
  priority: AdvicePriority
  items: Advice[]
  empty: string
}) {
  return (
    <Panel
      title={title}
      span={4}
      note={items.length > 0 ? <span className="panel-note">{items.length}</span> : undefined}
    >
      {items.length === 0 ? (
        <p className="advice-empty">{empty}</p>
      ) : (
        <div className="advice-list">
          {items.map((item) => (
            <article className={`advice advice-${priority}`} key={item.id}>
              <p className="advice-fact">{item.fact}</p>

              {item.meter && (
                <div className="advice-meter">
                  <div className="bar-track">
                    <span
                      className="bar-fill bar-fill-out"
                      style={{ width: `${Math.min(Math.max(item.meter.value, 0), 1) * 100}%` }}
                    />
                    {item.meter.reference !== undefined && (
                      <span
                        className="bar-mark"
                        style={{ left: `${Math.min(item.meter.reference, 1) * 100}%` }}
                      />
                    )}
                  </div>
                  <p className="advice-meter-label">{item.meter.label}</p>
                </div>
              )}

              {item.suggestion && <p className="advice-suggestion">{item.suggestion}</p>}

              <p className="advice-source">{METHODS[item.method]?.name}</p>
            </article>
          ))}
        </div>
      )}
    </Panel>
  )
}

/** Where each rule's reference comes from, and when it was last checked. */
function Methodology({ asOf, span }: { asOf: string; span: 6 | 12 }) {
  const [open, setOpen] = useState(false)
  const entries = Object.entries(METHODS)

  return (
    <Panel
      title="Metodologiya"
      span={span}
      note={
        <button type="button" className="button button-quiet" onClick={() => setOpen(!open)}>
          {open ? 'Gizlət' : 'Mənbələri göstər'}
        </button>
      }
    >
      <p className="method-lead">
        Bu səhifə maliyyə məsləhəti deyil. Hesablamalar sizin öz rəqəmlərinizdir;
        çərçivələr aşağıdakı mənbələrdən götürülüb və istinad kimi göstərilir.
      </p>

      {open && (
        <ul className="methods">
          {entries.map(([id, method]) => (
            <li className="method" key={id}>
              <div className="method-head">
                <span className="method-name">{method.name}</span>
                <span className="pill">{ORIGIN_LABEL[method.origin]}</span>
              </div>
              <p className="method-note">{method.note}</p>
              <p className="method-meta">
                {method.url ? (
                  <a href={method.url} target="_blank" rel="noreferrer noopener">
                    {method.source}
                  </a>
                ) : (
                  method.source
                )}
                {' · '}
                <span className={needsReview(method, asOf) ? 'neg' : undefined}>
                  yoxlanılıb {method.reviewedOn}
                  {needsReview(method, asOf) && ' — yenilənməlidir'}
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
