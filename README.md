# Spendly

A personal budget app for one person and their own money. It replaces a
monthly Google Sheet: you record what you earned and spent, plan what each
month is supposed to cost, and the app works out every total from those two
things.

Amounts are in manat (`1,250.00 ₼`) and the interface is in Azerbaijani.

- **Nothing is typed twice.** Totals, differences and percentages are all
  calculated. There is no cell to keep up to date by hand.
- **Nothing is invented.** Every figure on screen traces back to a transaction
  you entered. Tap any number to see exactly which ones it came from.
- **Nothing is a judgement.** The app will tell you food spending is 38% lower
  than last month. It will never tell you that you spend too much on food.

---

## Getting started

```bash
npm install
```

```bash
npm run dev
```

Then open **http://localhost:5180**.

That is enough to use it. Data is saved in your browser until you connect a
database — see [Where your data lives](#where-your-data-lives).

---

## The three screens

The month you are looking at is set in the header, and applies everywhere.

### İcmal — the overview

Your dashboard. It answers, in order: where do I stand, how did money move,
where did it go, was that the plan, and when did it happen.

Some of what you will find there:

| Panel | Tells you |
| --- | --- |
| **Balans** | What you have, and how that moved since last month |
| **Büdcə** | How much of the month's plan is used, and by which categories |
| **Pul dövriyyəsi** | What came in, what went out, what you kept |
| **Pul axını** | Income against spending, week by week, with your balance over the top |
| **Nə dəyişdi** | Plain sentences about what moved since last period |
| **Pul hara getdi** | Every category, ranked, with its share and its change |
| **Plan və faktiki** | Each category against what you planned for it |
| **Gəlir mənbələri** | Where income came from, against what you planned |
| **Xərc tempi** | Your spend per day, and where that rate lands by month end |
| **Həftənin günləri** | Which days of the week carry your spending |
| **Ən çox təkrarlanan** | What you keep buying |
| **Müqayisə** | This period against the one before it, line by line |

**Panels you do not see are panels with no data behind them.** A month with
nothing in it shows a short page instead of a wall of zeroes. Add transactions
and a plan, and the rest fill in.

Almost everything is clickable. Tap a category, a day, a bar or an amount and
you get the transactions behind it.

### Əməliyyatlar — transactions

Everything recorded for the month, newest first. Filter to income or expenses
with the tabs. Tap any row to edit or delete it.

### Məsləhətlər — what the numbers say

Your month measured against established budgeting practice. A **Büdcə vəziyyəti**
block (income, spending, what is left, the retained share, the gap against your
plan), then findings in three groups — **Diqqət tələb edir**, **Yaxşı gedir**,
**Nəzərdən keçirməyə dəyər** — at most three each, ranked by the manat at stake.

Every sentence is produced by a rule that either fires or does not; nothing is
generated. A rule with too little data behind it stays silent and says what it
is missing under **Hələ hesablana bilməyənlər**.

Three panels need to know what your spending is *for*: **Ehtiyac və istək**,
**50/30/20 çərçivəsi** and **Təcili ehtiyat fondu**. Give each category a type
in **Büdcə → Kateqoriyalar** (zəruri, istəyə bağlı, borc ödənişi, yığım) and
they fill in. Until 90% of a month's spending is classified they stay blank and
name the categories still missing — nothing is guessed.

The emergency-fund figure is a **target only**. The app never sees an account
balance, so it cannot tell you how far along you are, and the number of months
is yours to choose — the CFPB deliberately publishes no universal figure.

**Metodologiya** at the foot lists every reference used, its source, whether it
is a US or international one, and the date it was last checked. This is
budgeting arithmetic and educational reference material, not financial advice.

### Büdcə — the plan

What the month is *supposed* to look like:

- **Planlaşdırılan gəlir** — what you expect to earn, per income category.
- **Planlaşdırılan xərclər** — your planned spending lines, grouped by
  category, next to what you have actually spent.
- **Planlaşdırılan qalıq** — planned income minus planned spending. If it is
  negative, the plan spends more than it earns, and the app says so.
- **Kateqoriyalar** — your own categories, for both income and spending.
- **Silmə** — the delete tools, deliberately at the very bottom.

---

## How to do things

| I want to… | Do this |
| --- | --- |
| Record something | **Əlavə et** in the header (or the **+** button on a phone) |
| Change or remove one entry | Tap it → edit, or **Sil** → **Silinməni təsdiqlə** |
| Look at another month | The month arrows in the header |
| Look at a longer stretch | The period buttons on İcmal: **Bu ay · Keçən ay · 3 ay · 6 ay · Bu il** |
| Start planning a month | **Büdcə** → **Planı köçür** to copy last month's plan forward |
| Add a planned expense | **Büdcə** → **Sətir əlavə et** |
| Set expected income | **Büdcə** → **Planlaşdırılan gəlir** → **Dəyiş** |
| Add a category | **Büdcə** → **Kateqoriyalar** → **+ Kateqoriya əlavə et** |
| Rename a category | Tap it in **Kateqoriyalar**, type the new name, save |
| Delete a category | Tap it → **Sil** |
| Classify a category | Tap it → **Növü** (needed by the 50/30/20 and needs-vs-wants panels) |
| Wipe one month's plan | **Büdcə** → **Silmə** → **Planı sil** → **Təsdiqlə** |
| Wipe everything | **Büdcə** → **Silmə** → **Bütün məlumatları sil** |
| See my account | The round button at the top right |
| Sign out | The same button → **Çıxış** |

Every destructive action needs a second click to confirm.

### About categories

Categories are yours. The app starts you off with a set carried over from the
original spreadsheet, and you can add, rename and delete freely.

**Renaming is safe.** Rename `Ərzaq` to `Yemək` and every transaction, budget
line and planned figure that used it comes along. No amount changes, and no
total on the dashboard moves.

**Deleting will not quietly take your history with it.** If nothing uses a
category, it just goes. If something does, the app tells you how much depends
on it and asks which category that history should move to. Your transactions
are never deleted as a side effect of tidying up a list.

### About periods

Periods are always whole months, because plans only exist per month. Every
"compared with" figure uses the equally long stretch immediately before — this
month against last month, three months against the three before them — so you
are always comparing like with like.

---

## Where your data lives

**By default, in your browser.** No account, no server, nothing leaves your
machine. Clearing your browser data clears the app.

**Optionally, in your own Supabase project**, which gets you a real database
and a backup. Copy `.env.example` to `.env`, fill in your project URL and
publishable key, then do two things in the Supabase dashboard:

1. **Create the tables** — paste [`supabase/schema.sql`](supabase/schema.sql)
   into the SQL editor and run it. Running it again later is safe, and is how
   you pick up changes — the `categories.kind` column is the most recent.
2. **Turn on the Email provider** — Authentication → Sign In / Providers.

Until both are done the app tells you which step is missing instead of showing
a raw error.

You then create an account in the app itself: **Qeydiyyat**, an email address
and a password. Your data belongs to that account, so it opens on any browser
or device you sign in from. It stays private — the database only ever returns
rows belonging to your own account.

If Supabase is set to confirm email addresses (the default), the app tells you
to open the confirmation link before your first sign-in. For a personal tool
you can turn confirmation off under Authentication → Sign In / Providers →
Email.

---

## If something looks wrong

**"The dashboard is nearly empty."** Panels hide themselves when there is no
data behind them. A month with no transactions and no plan has three. Add a
plan (**Büdcə** → **Planı köçür**) and a few transactions and the rest appear.
`Müqayisə` also needs the *previous* period to have transactions in it.

**"A planned amount is under a category I deleted."** It shows as its own line
marked `kateqoriya silinib`, and stays editable — so you can move it or zero it
out on purpose. The app will not silently drop a figure to make a list look
tidy.

**"It says sign-up is closed."** Step 2 of the Supabase setup above — the
Email provider is off.

**"My data is gone after I signed in."** Data belongs to an account. Anything
recorded before you created one belonged to a temporary browser identity, and
is still in the database under that old id — see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the query that moves it
across.

**"It cannot find a table."** Step 1 of the Supabase setup above.

---

## Development

```bash
npm test         # 204 tests
npm run build
```

How the numbers are derived, what the analytics rules are and why the code is
laid out the way it is: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
