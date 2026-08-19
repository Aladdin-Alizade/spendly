# Financial intelligence layer — research and proposal

Status: **implemented**, on the Məsləhətlər screen. Everything in §2.1 and
§2.2 is built; §2.3 remains deliberately unbuilt, for the reasons given there.

This document is the research summary and the implementation plan. It exists
before the code so the methodology can be argued with before it is encoded.

---

## 1. What the app can actually see

Everything below is derived from these four records. No other financial data
exists in the app.

| Record | Fields | What it can support |
| --- | --- | --- |
| `Transaction` | date, type (income/expense), category, description, amount | actual income, actual spending, timing, per-category totals |
| `BudgetLine` | month, description, category, planned | planned spending per category **per month, including future months** |
| `IncomePlan` | month, amounts per income category | planned income |
| `CategoryDef` | id, name, type | the category list itself |

**What the app cannot see, and therefore cannot honestly calculate:**

- **Account balances.** It never knows how much money exists, only what moved.
- **Whether retained money was saved.** Money not spent is money not spent.
- **Debt balances, rates or terms.** Only that a payment happened.
- **Gross income.** Recorded income is what arrived, which for salaried users
  is net of tax. Every ratio a lender publishes uses *gross* income.
- **Whether a category is a need or a want.** Nothing in the model says so.

These absences decide most of what follows.

---

## 2. Methodologies researched

### 2.1 Adopted — computable today, no data-model change

| Methodology | Calculation | Source |
| --- | --- | --- |
| **Expense-to-income ratio** | `expenses ÷ income` for the period | [FDIC Money Smart](https://www.fdic.gov/consumer-resource-center/money-smart-adults) frames a budget as income − expenses = what is left |
| **Money retained / retained rate** | `income − expenses`, and that over income | Analogue of the [BEA personal saving rate](https://www.bea.gov/data/income-saving/personal-saving-rate) (saving ÷ disposable income). Named *retained*, not *saved*, because the app cannot see whether the money was saved |
| **Budget variance** | per category, `actual − planned`; also totals | Planned-vs-actual review is the core of the [FDIC Money Smart](https://www.fdic.gov/consumer-resource-center/money-smart-adults) spending-and-saving plan |
| **Repeated overrun** | count of months where `actual > planned` for a category, over the last N months | Application rule; extends variance across time |
| **Category concentration** | each category's share of period spending | [CFPB "Your Money, Your Goals"](https://www.consumerfinance.gov/consumer-tools/educator-tools/your-money-your-goals/toolkit/) spending-tracker analysis |
| **Trend vs rolling average** | current month against the mean of the previous 3 | Application rule; standard descriptive statistic |
| **Spending anomaly** | robust outlier test: `\|x − median\| ÷ MAD > 2.5` | [Leys et al. (2013), *J. Exp. Soc. Psych.*](https://dipot.ulb.ac.be/dspace/bitstream/2013/139499/1/Leys_MAD_final-libre.pdf) — mean/SD are themselves distorted by the outlier; MAD is not |
| **Zero-based check** | `planned income − planned expenses`; how much planned income is unallocated | Zero-based budgeting, [Peter Pyhrr, Texas Instruments, 1969](https://en.wikipedia.org/wiki/Zero-based_budgeting), later adapted to household use |
| **Unexpected spending** | already implemented: `min(actual, planned)` is expected, the rest is not | Existing app definition, documented in ARCHITECTURE.md |
| **Recurring burden** | recurring planned lines ÷ income | Already computed by `recurringCommitments` |
| **Sinking funds** | for a planned line in a **future** month: `planned ÷ months until that month` | Standard technique: set aside monthly for a known future cost. Derivable because the app already plans by month — **no new field needed** |
| **Lifestyle inflation** | growth in expenses vs growth in income, last 3 months against the 3 before | Application rule, stated factually |

### 2.2 Adopted — but each needs **one** new field

| Methodology | Calculation | Source | Needs |
| --- | --- | --- | --- |
| **Needs vs wants** | essential vs discretionary share of spending | [CFPB, *Budgeting for needs and wants*](https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/teach/activities/budgeting-needs-and-wants/); [FDIC Money Smart](https://www.fdic.gov/consumer-resource-center/money-smart-adults) — "a want is something you would like to have but can live without" | category classification |
| **50/30/20** | needs / wants / savings as % of income against 50-30-20 | [Warren & Tyagi, *All Your Worth* (2005)](https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/teach/activities/analyzing-budgets/); taught by CFPB as **one** rule among others | category classification |
| **Emergency fund target** | `essential monthly expenses × N months`, N chosen by the user | [CFPB emergency fund guide](https://www.consumerfinance.gov/an-essential-guide-to-building-an-emergency-fund/) — *"The amount you need … depends on your situation"*; context from [Federal Reserve SHED](https://www.federalreserve.gov/publications/2026-economic-well-being-of-us-households-in-2025-savings-investments.htm) | category classification |

**The one field:** `CategoryDef.kind` — `essential | discretionary | debt | saving`,
unset by default. **Built**, and set from the category dialog on the Büdcə
screen.

That single addition unlocks all three. Nothing is guessed: a category with no
`kind` stays unclassified, and every analysis above reports its **coverage**
(the share of spending it could classify) and withholds itself below a
threshold rather than producing a confident wrong number.

### 2.3 Rejected — and why

| Methodology | Why not |
| --- | --- |
| **Debt-to-income ratio (43% etc.)** | [CFPB defines DTI as monthly debt payments ÷ **gross** monthly income](https://www.consumerfinance.gov/ask-cfpb/what-is-a-debt-to-income-ratio-en-1791/). The app records income *received*, not gross. Publishing a threshold against the wrong denominator would flatter every user. **Instead:** report "debt payments were X% of income received", explicitly labelled as not the lender ratio |
| **Emergency fund *progress*** | Requires a savings balance the app does not store. The target can be computed; progress toward it cannot |
| **Net worth, investment or product guidance** | No asset, liability or holdings data. Out of scope by your instruction |
| **Fixed vs variable expenses** | Would need a per-line classification distinct from essential/discretionary. Marginal value over needs/wants; a second field for a weaker insight |
| **Composite "financial health score"** | Any weighting of ratios into one number is an invention. **Instead:** Budget Health is a set of individually-defined indicators, each with its own documented rule |

---

## 3. Budget Health — the definition

No score. A set of named indicators, each computed one way and stated plainly.

| Indicator | Definition | Shown when |
| --- | --- | --- |
| Income | sum of income transactions | always |
| Expenses | sum of expense transactions | always |
| Remaining | income − expenses | always |
| Retained rate | (income − expenses) ÷ income | income > 0 |
| Spending vs plan | expenses − planned expenses | a plan exists |
| Unclassified spending | share of spending with no `kind` | classification in use |

Each carries a state — `ok`, `watch`, `over` — from its own rule, not from a
shared scale. The rules and their thresholds live in one file (§5).

---

## 4. Insight prioritisation

At most three per bucket, as requested.

- **Needs attention** — negative retained money; total spending over plan;
  a repeated overrun; a confirmed anomaly.
- **Doing well** — retained rate above the previous period; a category brought
  back inside plan; total spending under plan.
- **Worth reviewing** — concentration; trend; recurring burden; lifestyle
  inflation; unallocated planned income.

Ordering within a bucket is by **materiality**: the absolute manat amount
involved, so a 40% overrun on a 5 ₼ line never outranks a 200 ₼ one.

Wording follows your rule: facts are stated (`Ərzaq spending is 120 ₼ above
your plan`), interpretations are labelled, and recommendations are suggestions
(`One area worth reviewing is…`) — never instructions.

---

## 5. Thresholds — one file, each one sourced

`src/lib/insights/thresholds.ts`. Every entry is marked either **framework**
(from a cited methodology) or **app rule** (a product decision).

| Constant | Value | Basis |
| --- | --- | --- |
| `FRAMEWORK_50_30_20` | 0.50 / 0.30 / 0.20 | framework — Warren & Tyagi |
| `ANOMALY_MAD_MULTIPLIER` | 2.5 | framework — Leys et al. (2013) |
| `ANOMALY_MIN_MONTHS` | 4 | app rule — MAD is meaningless on 2 points |
| `MATERIAL_VARIANCE_RATIO` | 0.10 | app rule — matches the existing `MATERIAL_CHANGE` |
| `MATERIAL_AMOUNT` | 5 ₼ | app rule — already in `analytics.ts` |
| `REPEATED_OVERRUN` | 3 of last 4 months | app rule |
| `TREND_MIN_RATIO` | 0.15 | app rule |
| `CLASSIFICATION_COVERAGE_MIN` | 0.90 | app rule — below this, 50/30/20 is withheld |
| `EMERGENCY_FUND_MONTHS` | user-set, default 3 | CFPB declines to publish a universal figure |

---

## 6. Data-model change requested

One column, one enum, one control.

```ts
export type CategoryKind = 'essential' | 'discretionary' | 'debt' | 'saving'

export interface CategoryDef {
  id: string
  name: string
  type: TransactionType
  kind?: CategoryKind   // unset = unclassified, and analyses say so
}
```

```sql
alter table public.categories
  add column if not exists kind text
  check (kind is null or kind in ('essential','discretionary','debt','saving'));
```

Set from the existing category dialog. Optional. Nothing breaks when it is
absent — the analyses that need it disclose that they are unavailable.

**Not requested:** savings balances, debt balances, due dates, goals, sinking-fund
records. Sinking funds come out of future-month budget lines you already create.

---

## 7. 50/30/20 mapping, stated openly

*All Your Worth* puts **minimum debt payments inside must-haves**, not in the
20%. So:

- **Needs (reference 50%)** = `essential` + `debt`
- **Wants (reference 30%)** = `discretionary`
- **Savings (reference 20%)** = `saving` spending + money retained

Presented as a reference framework with its source, never as a pass/fail. CFPB
teaches it as one rule among several and notes it does not fit everyone.

---

## 8. Not financial advice

The app presents budgeting arithmetic and educational frameworks. It does not
advise on investments, securities, tax, loans or financial products, does not
recommend products, and does not guarantee outcomes. Each panel distinguishes
**calculation**, **framework**, and **observation**.

---

## Sources

- [CFPB — An essential guide to building an emergency fund](https://www.consumerfinance.gov/an-essential-guide-to-building-an-emergency-fund/)
- [CFPB — What is a debt-to-income ratio?](https://www.consumerfinance.gov/ask-cfpb/what-is-a-debt-to-income-ratio-en-1791/)
- [CFPB — Budgeting for needs and wants](https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/teach/activities/budgeting-needs-and-wants/)
- [CFPB — Analyzing budgets (50-30-20 teaching activity)](https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/teach/activities/analyzing-budgets/)
- [CFPB — Your Money, Your Goals toolkit](https://www.consumerfinance.gov/consumer-tools/educator-tools/your-money-your-goals/toolkit/)
- [CFPB — Emergency Savings and Financial Security (2022 research)](https://www.consumerfinance.gov/data-research/research-reports/emergency-savings-financial-security-insights-from-making-ends-meet-survey-and-consumer-credit-panel/)
- [Federal Reserve — Report on the Economic Well-Being of U.S. Households in 2025](https://www.federalreserve.gov/publications/2026-economic-well-being-of-us-households-in-2025-savings-investments.htm)
- [FDIC — Money Smart for Adults](https://www.fdic.gov/consumer-resource-center/money-smart-adults)
- [MyMoney.gov — MyMoney Five](https://www.mymoney.gov/mymoneyfive)
- [BEA — Personal Saving Rate](https://www.bea.gov/data/income-saving/personal-saving-rate)
- [Leys, Ley, Klein, Bernard & Licata (2013) — Detecting outliers](https://dipot.ulb.ac.be/dspace/bitstream/2013/139499/1/Leys_MAD_final-libre.pdf)
- Warren, E. & Warren Tyagi, A. (2005). *All Your Worth: The Ultimate Lifetime Money Plan* — origin of 50/30/20

---

## 9. Keeping the guidance current

Published guidance changes. An application built in 2026 cannot know that a
framework was revised in 2030, and pretending otherwise is the failure mode
worth designing against.

It is not solved by fetching anything at runtime: there is no authoritative
machine-readable feed of budgeting guidance, and a network call would make the
advice non-deterministic, which is the property the whole layer is built on.

What is done instead, in `src/lib/insights/methodology.ts`:

- Every reference is **data, not code** — name, note, source, URL, origin and
  the date it was last verified. Correcting one is a one-line edit that touches
  no rule and no component.
- Each carries **`reviewedOn`**, shown next to the source on screen.
- Past `REVIEW_INTERVAL_MONTHS` (12) an entry is **marked as needing review**,
  and the screen shows a banner naming how many are due. The app never presents
  an unchecked reference as though it were current.

So the guarantee is not "always up to date" — no offline app can promise that.
It is: **the app will never quietly show you a figure it has not checked**, and
updating it is a single file.

## 10. Country and region

Most published budgeting guidance is written for one jurisdiction. The 50/30/20
split is from a US book, the debt-to-income thresholds are US mortgage rules,
and the emergency-fund research is US survey data. Presenting any of it as a
fact about money would be wrong.

Each reference therefore declares an **`origin`** — `US`, `international`
(arithmetic or a statistical method, which belongs to no country) or `app` —
and the screen labels it.

A **region selector is not implemented**, deliberately. A control that changes
nothing is worse than no control: it implies a localisation that does not
exist. No authoritative Azerbaijani household-budgeting framework was found in
the research, and inventing local percentages would break the first rule of
this layer.

The shape is ready for it: `origin` already exists on every entry, so adding a
selector means adding sourced regional entries and filtering by them. The
moment there is a real local source, that is a small change — and the honest
order is source first, selector second.
