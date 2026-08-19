# Spendly — how it works

The developer-facing half of the documentation: where the numbers come from,
what the rules are, and why the code is shaped the way it is. For how to *use*
the app, see the [README](../README.md).

## Language

The interface is Azerbaijani. Categories are stored in Azerbaijani too, so
what is in the database matches what is on screen.

Categories were previously stored in Russian. `migrateCategory` in
[`src/lib/types.ts`](../src/lib/types.ts) maps the old names onto the new ones
and runs on load in both repositories, so data saved before the translation
keeps its category instead of dropping out of every total.

Month abbreviations are written out rather than sliced from the full names:
`İyun` and `İyul` share their first three letters, so slicing made June and
July identical on a chart axis. A test asserts all twelve are distinct.

Amounts stay in the `1,250.00 ₼` format from the original brief.

## Persistence

The app runs on Supabase when `.env` is filled in, and on this browser's own
storage when it is not. Nothing above `FinanceRepository` knows the difference.

### Why there is a sign-in at all

The publishable key ships inside the JavaScript bundle, so it is public by
design and cannot be what keeps the data private. Row level security does that:
every row carries a `user_id` and the policies only ever match `auth.uid()`.
Signing in is what gives those policies something to match.

It used to be an **anonymous** sign-in, chosen to keep a login screen out of a
personal tool. That put the identity in browser storage, and the failure mode
was bad in a way that is easy to miss: clearing site data, or opening the app
in another browser, minted a *new* anonymous user. The previous rows were never
deleted — they stayed in the tables under an id that nothing could produce
again, so the app showed an empty account and the data looked lost.

Email accounts remove the failure entirely. `AuthProvider` owns the session,
`Root` renders the sign-in screen until there is one, and `SupabaseRepository`
never signs anyone in — it asks for the current user and fails loudly if there
is none, because reaching it without a session is a bug rather than a state to
recover from.

The repository is keyed by user id, so signing into a different account
remounts the store rather than leaving the previous account's figures on
screen.

#### Recovering rows stranded under an old anonymous id

Run in the SQL editor, which bypasses RLS:

```sql
select 'transactions' as tbl, user_id, count(*) from public.transactions group by user_id
union all select 'budget_lines', user_id, count(*) from public.budget_lines group by user_id
union all select 'income_plans', user_id, count(*) from public.income_plans group by user_id
union all select 'categories',   user_id, count(*) from public.categories   group by user_id
order by 1, 3 desc;
```

Then move the old identity's rows onto the account's id. Do it before making
any edits under the new account: `categories` is unique on
`(user_id, type, name)`, so a category created under the new account collides
with the restored one of the same name.

```sql
update public.transactions set user_id = 'NEW_ID' where user_id = 'OLD_ID';
update public.budget_lines  set user_id = 'NEW_ID' where user_id = 'OLD_ID';
update public.income_plans  set user_id = 'NEW_ID' where user_id = 'OLD_ID';
update public.categories    set user_id = 'NEW_ID' where user_id = 'OLD_ID';
```

### Writes

The store hands the repository a whole `FinanceData` snapshot on every change.
`SupabaseRepository` diffs it against the last persisted snapshot and sends only
what moved, so renaming one transaction writes one row rather than the whole
history. Writes are queued so two quick edits cannot race, and the UI updates
before the network call rather than waiting on it.

## What the spreadsheet did

Three tabs, one file per month, currency AZN (₼).

| Tab | Contents |
| --- | --- |
| `BÜDCƏ İCMALI` | Summary: planned/actual income, planned/actual expenses, remainder |
| `Aylıq rasxod` | Budget lines: description, category, planned, actual, difference |
| `Əlavə məlumatlar` | SUMIF category rollup and the category master list |

## Formula mapping

Every figure in the app is derived in [`src/lib/calc.ts`](../src/lib/calc.ts).
Nothing is stored pre-computed and nothing is hard-coded.

| Sheet cell | Formula | App |
| --- | --- | --- |
| `C13` | `SUM(C11:C12)` | `summarise().plannedIncome` — now a sum over every income category, not two fixed rows |
| `D13` | `SUM(D11:D12)` | `summarise().actualIncome` — sum of income transactions |
| `F11` | `SUM('Aylıq rasxod'!D:D)` | `summarise().plannedExpenses` |
| `G11` | `SUM('Aylıq rasxod'!E:E)` | `summarise().actualExpenses` — sum of expense transactions |
| `D4` | `C13 - F11` | `summarise().plannedRemainder` |
| `D5` | `Фактические_Доходы - Фактические_расходы` | `summarise().actualRemainder` |
| `D6` | `D5 - D4` | `summarise().difference` |
| `F3:F25` | `D - E` | `budgetGroups().variance` (per category) |
| `Əlavə!C5:C12` | `SUMIF(category, actual)` | `categoryTotals()` |

The sheet is kept as test data — [`src/lib/__tests__/fixtures.ts`](../src/lib/__tests__/fixtures.ts)
— because it is the only set of figures this project has that somebody once
worked out by hand. Its 16 budget lines total **1,142.00 ₼**, planned salary is
**990.00 ₼** and the planned remainder **-152.00 ₼**; the calculations are
asserted against all three in [`src/lib/__tests__/calc.test.ts`](../src/lib/__tests__/calc.test.ts).
Nothing ships it to an account.

## What changed, and why

**Added — dated transactions.** The sheet's actual column (`E`) was a number
typed in by hand after adding purchases up mentally. Transactions make that
column derived, and the dates then support a month-over-month trend.

**Added — a month switcher**, replacing one spreadsheet file per month.
"Carry over plan" copies the previous month's lines and income plan forward,
since the lines recur. With no earlier month there is nothing to carry, so the
offer is not made — a first month is written from scratch.

**Removed — the three-tab split, the SUMIF helper tab, and the category
master-list column.** These were spreadsheet plumbing, not information.

**Not added — a separate "purchase" type.** The sheet has no such concept;
expenses carry a description and a category, which is what "what did I buy"
and "where did it go" are answered from.

**Actuals are reported per category, not per budget line.** A transaction
records a category, so line-level actuals do not exist. Splitting a category's
spend across its lines would invent numbers, so the Budget screen groups lines
under their category and compares at that level.

## The dashboard

The overview is a twelve-column grid of panels, read left to right and down.
Each row answers one question before the next is asked:

| Row | Panels | Question | Source |
| --- | --- | --- | --- |
| 1 | Balance · Budget · Cashflow | Where do I stand, and what has the plan got left? | `summarisePeriod`, `flowBuckets` |
| 2 | Money flow · What changed | How did money move, and what moved since last period? | `flowBuckets`, `insights` |
| 3 | Where it went · Planned vs actual | What did I spend most on, and did I stay inside the plan? | `categoryBreakdown` |
| 4 | Income sources · Expected vs unexpected · Spending pace | Where did income come from, what was not planned for, how fast is the month going? | `incomeSources`, `expectedSplit`, `spendingPace` |
| 5 | Daily activity · Weekday pattern | When did I spend? | `dailyActivity`, `weekdayPattern` |
| 6 | Recurring · Most repeated | What are my standing commitments, and what do I keep buying? | `recurringCommitments`, `frequentExpenses` |
| 7 | Largest expenses · Comparison · Plan | What were the big ones, how does this period compare, and what does the plan itself say? | `largestTransactions`, `summarisePeriod` |

Every panel hides itself when the data cannot support it, so an empty month is
a short page rather than a wall of zeroes — the grid is `dense`, so the
remaining panels close the gap instead of leaving a hole. Clicking any
category, day or amount opens the transactions behind it.

Each panel names itself inside its own card rather than under a heading above
it, so a panel can move anywhere in the grid without orphaning a title.

### Two rules the analytics follow

**Nothing is a judgement.** The app states `Еда spending is 38% lower than the
previous period`, never `you spend too much on food`. A test asserts that no
generated sentence contains advisory language.

**Where a concept needs a definition the spreadsheet does not supply, the rule
is written down and surfaced.** Two such definitions exist:

- *Unexpected spending* — per category, `min(actual, planned)` is expected and
  everything above it is unexpected, along with all spend in a category with no
  planned line. Expected + unexpected always equals total expenses.
- *Recurring* — a planned line whose description also appears in an earlier
  month's plan, which is exactly how the spreadsheet expressed recurrence: the
  same rows, copied forward. Payment status is matched by description and
  reports "not matched", never "unpaid".

A third figure is an extrapolation rather than a definition, and is labelled as
one: *spending pace* divides what has been spent by the days it was spent over,
and extends that rate across the month. It is arithmetic on days elapsed, not a
prediction of behaviour — for a month that has already ended it is simply the
total, and is reported as an average instead.

`frequentExpenses` is the transaction-side counterpart of `recurringCommitments`:
it groups by description regardless of whether the plan ever named it, so
something bought every week with no budget line for it still shows up.

### Periods

The header month switcher sets the anchor; the period selector sets the span
(this month, last month, 3, 6, year to date). Periods are whole months because
planned amounts only exist per month. Every "compared with" figure uses the
equally long run of months immediately before, so like is compared with like.

### Charts

There is no charting library. The flow chart is CSS bars with an SVG overlay
for the balance line, the budget ring is a stroked SVG circle, and the rest are
CSS bars — which keeps the app small and avoids a stretched `viewBox`
distorting anything. Where a `viewBox` is stretched on purpose (the sparkline),
everything in it is a stroke with `non-scaling-stroke`, including the end
marker: a circle element would arrive as an oval.

### Colour

One accent, two semantic colours, and six series hues. Colour is never
decoration — a hue always stands for a category, a direction, or a comparison
against the plan. Series hues are bound to categories once, from the ranked
breakdown (`categoryColors`), and the same lookup is handed to the ring, the
ranking and the plan comparison, so a category is the same colour in every
panel it appears in.

## Categories

Categories used to be a hard-coded list. They are data now: `FinanceData.categories`
holds them, and the Budget screen creates, renames and removes them.

**A new account holds none.** Categories, and the plan written against them,
are the shape somebody gives their own money; handing a stranger one
household's list of them names their spending for them and puts figures in
their budget that were never theirs. So the app seeds nothing, and every
category in an account was made by its owner. The one exception is repair,
not seeding: a snapshot saved before categories were records of their own has
no list, so [`categoriesFromData`](../src/lib/categories.ts) reads back the names
its own rows already use. A snapshot with no rows implies nothing, which is
what a new account is.

Everything else references a category **by name**, the way the spreadsheet did
and the way every stored row already reads. So a rename is not an edit to one
record — [`renameCategory`](../src/lib/categories.ts) carries every transaction and
budget line that names the old category across in the same change, or the
history would fall out of its own totals. No amount is touched, so a rename
cannot move a single figure on the dashboard.

Deleting is the case worth stating. A category nothing uses is simply dropped.
One that is in use cannot be — the transactions naming it would point at
something that no longer exists — so the dialog says how much history depends on
it and asks where that history should go. Deleting the records along with the
category would destroy money the user never asked to remove, so it is not
offered.

A name has to be unique within its own side of the ledger only: an expense and
an income category may share a name, because nothing ever looks a category up
without its type.

### Planned income follows the categories

The sheet planned income as exactly two rows, `BÜDCƏ İCMALI`!C11:C12, so
`IncomePlan` used to be exactly two fields — `salary` and `additional`. With
income categories editable that shape was wrong: renaming or removing an income
category left the plan showing two names that no longer existed.

`IncomePlan.amounts` is a figure per income category now, and a rename carries
the planned figure with it the same way it carries transactions. Plans saved in
the old shape are read through `migrateIncomePlan`, which files the two figures
under the two categories that shape stood for.

A figure whose category has since gone is **shown, not dropped** — as its own
line marked `kateqoriya silinib`, and editable so it can be cleared on purpose.
Hiding it would leave a list of rows that does not add up to its own total,
which is how a planned amount goes missing without anyone being told.

## Structure

```
src/
  lib/               types, money, dates, calc, period, analytics,
                     categories, validation, storage
  store/             FinanceProvider — the only stateful layer
  components/        list, dialogs (transaction, budget line, income plan,
                     category, drill-down), month switcher, primitives
  components/charts/ FlowChart, RankedBars, PlanBars, DayStrip,
                     SpendRing, Sparkline, series (the colour binding)
  screens/           Dashboard, Transactions, Budget
```

`src/lib/calc.ts` and `src/lib/analytics.ts` are pure and have no React or
storage dependency. The analytics layer derives everything from the same
`FinanceData` the rest of the app uses — there is no second financial model.
A reconciliation test asserts that the summary, the category breakdown, the
expected/unexpected split, the flow buckets and the daily activity all report
the same total for the same period.
`src/lib/storage.ts` defines `FinanceRepository`; the app talks to that
interface only, so replacing localStorage with an API or database means
writing one class and changing nothing else.

## Money

All amounts are rounded to 2 decimals at every boundary (`round2`), so repeated
addition cannot drift. Amounts are stored positive; direction comes from the
transaction type. Formatting matches the sheet's cell format: `1,250.00 ₼`.
