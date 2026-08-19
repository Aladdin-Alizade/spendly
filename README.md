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

### Your first few minutes

A new account is **empty** — no categories, no plan, no example figures.
Categories are how you decide to think about your own money, so the app does
not decide for you.

1. **Büdcə → Kateqoriyalar → + Kateqoriya əlavə et.** Make the handful you
   actually use, on both sides: what you earn (`Maaş`), and what you spend on
   (`Ərzaq`, `Nəqliyyat`, `Kirayə`…). More can be added at any time.
2. **Büdcə → Sətir əlavə et** for what you plan to spend this month, and
   **Planlaşdırılan gəlir → Dəyiş** for what you expect to earn.
3. **Əlavə et** in the header to record what you actually earn and spend.

From the second month on, **Planı köçür** copies the previous month's plan
forward, so step 2 is one tap.

---

## The screens

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
- **Planlaşdırılan yığım** — what you mean to put away this month, per pot,
  next to what you actually put away. Only deposits made out of income count
  towards it: meeting a savings plan out of a windfall is not meeting it.
- **Planlaşdırılan qalıq** — planned income minus planned spending. If it is
  negative, the plan spends more than it earns, and the app says so. When a
  savings plan exists, the line underneath subtracts it, so you can see what
  the month has left once you have paid yourself first.
- **Kateqoriyalar** — your own categories, for both income and spending.
- **Silmə** — the delete tools, deliberately at the very bottom.

### Yığım — money set aside

Savings are a third flow here, not a kind of spending. Money moved into a pot
has not been consumed, so it appears in no spending total; money taken back out
was not earned, so it appears in no income total.

- **Harada dayanırsınız** — three figures that add up: what you can spend, what
  you have put away, and the total. The balance on İcmal is the first of them.
- **Qablar** — one per goal, with an optional target. A target draws a
  progress bar; without one the pot simply reports its balance.
- **Hərəkətlər** — every deposit and withdrawal. A deposit says where the
  money came from, and that answer is the point of the whole screen:
  - **Gəlirimdən** — set aside out of money you had already earned. It leaves
    the spendable side without being spending.
  - **Kənardan** — a gift, a sale, a repaid loan that went straight to the pot.
    It touches neither your income nor your spending, so it cannot inflate the
    percentages on Məsləhətlər.

Every figure on this screen is as of the end of the month in the header, like
everywhere else in the app.

Once a pot has something in it, the emergency-fund panel stops showing a target
alone and starts showing how far along you are. To hold yourself to a monthly
figure rather than a final one, plan it in **Büdcə → Planlaşdırılan yığım**.

If you recorded savings the older way — as spending into a category marked
*Yığım* — the screen offers to convert those transactions into deposits. It
deletes the transactions, so it asks first.

---

## How to do things

| I want to… | Do this |
| --- | --- |
| Record something | **Əlavə et** in the header (or the **+** button on a phone) |
| Change or remove one entry | Tap it → edit, or **Sil** → **Silinməni təsdiqlə** |
| Look at another month | The month arrows in the header |
| Look at a longer stretch | The period buttons on İcmal: **Bu ay · Keçən ay · 3 ay · 6 ay · Bu il** |
| Start planning a month | **Büdcə** → **Planı köçür** to copy last month's plan forward (from your second month on) |
| Add a planned expense | **Büdcə** → **Sətir əlavə et** |
| Set expected income | **Büdcə** → **Planlaşdırılan gəlir** → **Dəyiş** |
| Add a category | **Büdcə** → **Kateqoriyalar** → **+ Kateqoriya əlavə et** |
| Start saving | **Yığım** → **Qab əlavə et**, name the goal, optionally set a target |
| Record money set aside | **Yığım** → **Qoy / götür** → **Qoyuram** → **Gəlirimdən** |
| Record a windfall you saved | The same, but **Kənardan** — it stays out of your income figures |
| Take money out of a pot | **Qoy / götür** → **Götürürəm**, then record the spending as a normal transaction |
| Plan what to save each month | **Büdcə** → **Planlaşdırılan yığım** → **Dəyiş** |
| Rename a category | Tap it in **Kateqoriyalar**, type the new name, save |
| Delete a category | Tap it → **Sil** |
| Classify a category | Tap it → **Növü** (needed by the 50/30/20 and needs-vs-wants panels) |
| Wipe one month's plan | **Büdcə** → **Silmə** → **Planı sil** → **Təsdiqlə** |
| Wipe everything | **Büdcə** → **Silmə** → **Bütün məlumatları sil** |
| Change your password | The profile button → **Şifrə** → **Dəyiş** |
| Reset a forgotten password | **Şifrənizi unutmusunuz?** on the sign-in screen |
| See my account | The round button at the top right |
| Sign out | The same button → **Çıxış** |

Every destructive action needs a second click to confirm.

### About categories

Categories are yours. The app hands out none of its own — you add, rename and
delete them freely, and an account starts with an empty list.

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

**Always in your browser first.** Every change is written to this browser's
own storage before anything is asked of the network, so an edit made on a bad
connection is saved rather than held on screen and lost when the tab closes.

With no Supabase project configured that storage is the whole story: no
account, no server, nothing leaves your machine. Clearing your browser data
clears the app.

**Optionally, in your own Supabase project**, which gets you a real database
and a backup. Copy `.env.example` to `.env`, fill in your project URL and
publishable key, then do two things in the Supabase dashboard:

1. **Create the tables** — paste [`supabase/schema.sql`](supabase/schema.sql)
   into the SQL editor and run it. Running it again later is safe, and is how
   you pick up changes — the `savings_pots`, `savings_entries` and
   `savings_plans` tables are the most recent, and the app cannot save a pot
   until they exist.
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

### If you forget the password

**Şifrənizi unutmusunuz?** on the sign-in screen emails a link. Opening it
brings you back here with one screen: set the new password. The confirmation is
the same whether or not the address has an account — an app that says "no such
user" is an app that will tell anyone which addresses are registered.

For the link to come back to the app, its address has to be listed in the
Supabase dashboard under **Authentication → URL Configuration** (Site URL, and
the app's own origin under Redirect URLs).

**Mind the mail quota.** Supabase's built-in mail service sends only a handful
of messages an hour, and sign-up confirmations and reset links share it. If it
refuses, the app now says so in those terms rather than blaming the attempt.
Connect your own SMTP under **Project Settings → Authentication → SMTP** to
lift it.

### Being offline

Losing the connection is a normal state here, not a failure. The browser's copy
stays the working copy; the account is where it is shared from. When the server
cannot be reached the app says *"dəyişikliklər bu brauzerdə saxlanılıb,
sinxronizasiya gözləyir"* and carries on. The queue goes out on its own when
the connection returns, when you come back to the tab, or when you press **İndi
göndər** — in the banner, or in the profile.

Bringing the two together follows one rule: **rows this browser changed while
it could not reach the server win; every other row comes from the server.** So
work done here is never silently replaced by what another device had, and
anything entered elsewhere meanwhile still arrives. Two devices editing the
very same transaction while both offline is the case it cannot resolve — the
one that syncs second wins, and nothing is lost that was not deliberately
replaced.

A rejection from the server is a different thing from being offline, and is
said differently: the red banner means the server answered and refused, and it
names the step that fixes it. Your change is saved either way.

---

## If something looks wrong

**"The dashboard is nearly empty."** Panels hide themselves when there is no
data behind them. A month with no transactions and no plan has three. Add a
plan (**Büdcə** → **Sətir əlavə et**, or **Planı köçür** once there is an
earlier month) and a few transactions and the rest appear.
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

---

## Publishing it

The app is static once built, so GitHub Pages can host it. Pushing to `main`
runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which
builds and publishes `dist/`. The site lands at
**https://aladdin-alizade.github.io/spendly/**.

Three things have to be set up once, outside the repository:

1. **Settings -> Pages -> Source**: choose *GitHub Actions*. Without this the
   workflow builds and then has nowhere to put the result.
2. **Settings -> Secrets and variables -> Actions -> Variables**: add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. They are read at
   build time and end up in the bundle, which is fine — access is enforced by
   RLS, not by hiding the publishable key. The service_role key does not belong
   here. Leave them out and the deployed app still runs, but on browser-only
   storage with no accounts.
3. **Supabase -> Authentication -> URL Configuration**: add
   `https://aladdin-alizade.github.io/spendly/` as the Site URL and to the
   redirect list, or password-reset links will refuse to land back on the app.

The address is served from `/spendly/`, not from the domain root, which is why
`vite.config.ts` sets `base`. If the repository is ever renamed, that value and
the Supabase redirect have to be renamed with it.
