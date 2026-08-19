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
import {
  CLASSIFICATION_COVERAGE_MIN,
  KIND_LABEL,
  REFERENCE_50_30_20,
  classifySpending,
  emergencyFund,
  fiftyThirtyTwenty,
  hasCoverage,
} from '../lib/insights/classification'
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
  const split = useMemo(() => classifySpending(data, month), [data, month])
  const framework = useMemo(() => fiftyThirtyTwenty(data, month), [data, month])
  const [fundMonths, setFundMonths] = useState(3)
  const fund = useMemo(
    () => emergencyFund(data, month, fundMonths),
    [data, month, fundMonths],
  )
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
            Needs vs wants, and the frameworks that read them
         * --------------------------------------------------------- */}
        <Panel
          title="Ehtiyac və istək"
          span={4}
          note={
            split.total > 0 ? (
              <span className="panel-note">
                {Math.round(split.coverage * 100)}% təsnif edilib
              </span>
            ) : undefined
          }
        >
          {hasCoverage(split) ? (
            <>
              <div className="split-bar kinds">
                {(['essential', 'debt', 'discretionary', 'saving'] as const).map((kind) =>
                  split[kind] > 0 ? (
                    <span
                      key={kind}
                      className={`kind-${kind}`}
                      style={{ width: `${(split[kind] / split.total) * 100}%` }}
                    />
                  ) : null,
                )}
              </div>
              <div className="kind-legend">
                {(['essential', 'discretionary', 'debt', 'saving'] as const).map((kind) =>
                  split[kind] > 0 ? (
                    <div className="kind-row" key={kind}>
                      <span className={`swatch kind-swatch-${kind}`} />
                      <span className="kind-name">{KIND_LABEL[kind]}</span>
                      <span className="kind-amount num">{formatAZN(split[kind])}</span>
                      <span className="kind-share num">
                        {Math.round((split[kind] / split.total) * 100)}%
                      </span>
                    </div>
                  ) : null,
                )}
              </div>
              <p className="framework-note">
                Bu bölgü mühakimə deyil — hansı kateqoriyanın zəruri olduğunu siz
                təyin edirsiniz.
              </p>
            </>
          ) : (
            <Missing
              total={split.total}
              coverage={split.coverage}
              missing={split.missing}
            />
          )}
        </Panel>

        <Panel
          title="50/30/20 çərçivəsi"
          span={4}
          note={<span className="panel-note">istinad — qayda deyil</span>}
        >
          {framework ? (
            <>
              <FrameworkRow
                label="Zəruri (ehtiyac + borc)"
                actual={framework.needsShare}
                reference={REFERENCE_50_30_20.needs}
                amount={framework.needs}
              />
              <FrameworkRow
                label="İstəyə bağlı"
                actual={framework.wantsShare}
                reference={REFERENCE_50_30_20.wants}
                amount={framework.wants}
              />
              <FrameworkRow
                label="Yığım və qalan"
                actual={framework.savingsShare}
                reference={REFERENCE_50_30_20.savings}
                amount={framework.savings}
              />
              <p className="framework-note">
                CFPB bunu bir neçə büdcə qaydasından biri kimi öyrədir — hamıya
                uyğun gəlmir. Borc ödənişləri «zəruri» tərəfdə sayılır.
              </p>
            </>
          ) : (
            <Missing
              total={split.total}
              coverage={split.coverage}
              missing={split.missing}
              extra={
                split.total > 0 && hasCoverage(split)
                  ? 'Bu ay gəlir qeyd edilməyib.'
                  : undefined
              }
            />
          )}
        </Panel>

        <Panel
          title="Təcili ehtiyat fondu"
          span={4}
          note={<span className="panel-note">yalnız hədəf</span>}
        >
          {fund ? (
            <>
              <p className="micro">Zəruri aylıq xərc (median)</p>
              <p className="fund-value num">{formatAZN(fund.essentialMonthly)}</p>
              <p className="fund-note">{fund.sampleMonths} aylıq məlumat əsasında</p>

              <div className="fund-months" role="group" aria-label="Ay sayı">
                {[3, 6, 12].map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="period-option"
                    aria-pressed={fundMonths === option}
                    onClick={() => setFundMonths(option)}
                  >
                    {option} ay
                  </button>
                ))}
              </div>

              <div className="fund-target">
                <span className="micro">Hədəf</span>
                <span className="fund-target-value num">{formatAZN(fund.target)}</span>
              </div>

              <p className="framework-note">
                CFPB vahid rəqəm vermir — məbləğ vəziyyətinizdən asılıdır. Tətbiq
                hesab qalığınızı görmür, ona görə hədəfə nə qədər yaxın
                olduğunuzu deyə bilmir.
              </p>
            </>
          ) : (
            <Missing
              total={split.total}
              coverage={split.coverage}
              missing={split.missing}
              extra="Hesablama üçün ən azı 3 ayın təsnif edilmiş xərci lazımdır."
            />
          )}
        </Panel>

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

/**
 * Why a framework has nothing to show.
 *
 * Naming the categories still unclassified turns a dead end into the next
 * step, which is the difference between a blocked screen and an instruction.
 */
function Missing({
  total,
  coverage,
  missing,
  extra,
}: {
  total: number
  coverage: number
  missing: string[]
  extra?: string
}) {
  if (total <= 0) {
    return <p className="advice-empty">Bu ay xərc qeyd edilməyib.</p>
  }

  return (
    <div className="missing">
      <p className="missing-lead">
        Xərcin {Math.round(coverage * 100)}%-i təsnif edilib. Bu hesablama üçün ən
        azı {Math.round(CLASSIFICATION_COVERAGE_MIN * 100)}% lazımdır.
      </p>
      {missing.length > 0 && (
        <p className="missing-list">
          Təsnif edilməyən: {missing.slice(0, 5).join(', ')}
          {missing.length > 5 && ` və daha ${missing.length - 5}`}
        </p>
      )}
      <p className="missing-how">
        Büdcə → Kateqoriyalar bölməsində hər kateqoriyaya növ təyin edin.
      </p>
      {extra && <p className="missing-list">{extra}</p>}
    </div>
  )
}

/** One line of the reference comparison: what you did, against the reference. */
function FrameworkRow({
  label,
  actual,
  reference,
  amount,
}: {
  label: string
  actual: number
  reference: number
  amount: number
}) {
  return (
    <div className="framework-row">
      <div className="framework-head">
        <span className="framework-label">{label}</span>
        <span className="framework-actual num">{Math.round(actual * 100)}%</span>
      </div>
      <div className="bar-track">
        <span
          className="bar-fill bar-fill-out"
          style={{ width: `${Math.min(Math.max(actual, 0), 1) * 100}%` }}
        />
        <span className="bar-mark" style={{ left: `${reference * 100}%` }} />
      </div>
      <p className="framework-meta">
        {formatAZN(amount)} · istinad {Math.round(reference * 100)}%
      </p>
    </div>
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
