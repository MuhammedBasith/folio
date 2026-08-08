# Folio

**Know exactly who owes you what.**

Folio is a small application for tracking orders and the payments that settle
them. Write down what a customer ordered, record each payment as it arrives, and
Folio works out the balance, decides whether the order is short or late, and
keeps the arithmetic exact to the cent.

**Live:** _add your deployment URL_

**Demo:** `demo@folio.app` / `demo1234`
Seeded with seven orders covering every status, including one that was overdue
and is now settled, and one with a single cent outstanding.

---

## Contents

- [What this is](#what-this-is)
- [Running it locally](#running-it-locally)
- [Architecture](#architecture)
- [Money handling](#money-handling)
- [Status derivation, and the edge cases](#status-derivation-and-the-edge-cases)
- [Concurrency: the over-payment race](#concurrency-the-over-payment-race)
- [Order immutability](#order-immutability)
- [API reference](#api-reference)
- [Testing](#testing)
- [Design system](#design-system)
- [Assumptions and trade-offs](#assumptions-and-trade-offs)
- [What I would do before production](#what-i-would-do-before-production)
- [Deployment](#deployment)

---

## What this is

Folio is a private ledger, not a payment processor.

One business owner signs in and keeps a record of their own orders. A customer
is a name on an order, not an account: customers never see Folio, receive
nothing from it, and cannot log in. "Recording a payment" means the owner
writing down that money arrived, not the customer paying through the app. No
money moves through this system.

Accounts exist so that several unrelated businesses can share one deployment
without ever seeing each other's data.

Two things go past what a plain order tracker does, because a plain order
tracker stops one step short of what the screen is actually for:

- **Debtor ageing.** "You are owed $7,368" is close to useless on its own. Money
  four days late is an admin oversight; money four months late is a bad debt
  forming. The dashboard buckets what is outstanding by how far past its due
  date it is, on the conventional boundaries every bookkeeper already reads
  (current, 1-30, 31-60, 61-90, 90+). It renders nothing when everything is
  inside its terms, so it appears only on the days it has something to say.
- **A drafted chase message.** Nobody opens a receivables ledger to admire the
  total; they open it because somebody has not paid and they have to write the
  awkward email. Folio drafts it from the reference, the balance, what has
  already been paid and how late it is, and the tone escalates with the age on
  the same thresholds as the ageing buckets. It is editable before it is copied,
  and nothing is sent: there is no mail transport here, and adding one is a
  different product with a different set of failure modes.

Both are derived from data the product already has, need no schema change, and
are pure functions in `src/lib/domain/`, which is why they are tested rather
than eyeballed.

---

## Running it locally

### Prerequisites

- [Bun](https://bun.sh) 1.3 or newer
- PostgreSQL 14 or newer

### Setup

```bash
# 1. Install
bun install

# 2. Configure
cp .env.example .env
#    Fill in DATABASE_URL and DIRECT_URL, then generate a signing key:
#    openssl rand -base64 48

# 3. Create the schema
bun run db:deploy

# 4. Seed the demo data (optional but recommended)
bun run db:seed

# 5. Run
bun run dev
```

Open http://localhost:3000 and sign in with `demo@folio.app` / `demo1234`.

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooled connection. On Neon this is the `-pooler` host, with `?pgbouncer=true` appended so Prisma disables prepared statements. |
| `DIRECT_URL` | Unpooled connection, used only for migrations. A pooler cannot reliably run DDL. Locally the two are the same string. |
| `AUTH_SECRET` | HS256 signing key for session tokens. At least 32 characters; the app refuses to start otherwise. |

### Commands

```bash
bun run dev               # development server
bun run build             # production build
bun run verify            # typecheck + lint + unit tests

bun run test              # unit tests (pure logic, no I/O)
bun run test:integration  # integration tests (needs a test database, see Testing)
bun run test:all          # both

bun run db:migrate        # create and apply a migration
bun run db:deploy         # apply existing migrations
bun run db:seed           # load demo data
bun run db:studio         # browse the database

bun scripts/smoke.mjs [baseUrl]   # end-to-end API smoke test over HTTP
```

---

## Architecture

```
src/
  lib/
    money.ts              integer-cent arithmetic, parsing, formatting
    domain/orders.ts      totals, status derivation, payment rules  (pure)
    schemas/              zod schemas, shared by API and forms
    format.ts             date and label presentation
    api-client.ts         browser-side typed API client
    utils.ts              cn(), with the custom scales declared
  server/
    db/client.ts          Prisma singleton with the pg driver adapter
    auth/                 password hashing, JWT sessions, route guards
    api/                  error vocabulary and route wrappers
    repositories/         all database access, always scoped by owner
  app/
    api/                  REST endpoints
    (app)/                authenticated screens
    login, signup, page   public screens
  components/             UI
  styles/                 the design token system
```

Two rules hold this together:

**The domain layer is pure.** `src/lib/domain/orders.ts` has no database, no
framework, and no clock of its own; the current time is always passed in as
`asOf`. That is what makes "this order goes overdue tomorrow" a test you can
write rather than one that depends on when CI happens to run.

**There is exactly one implementation of every rule.** The REST API and the
server-rendered pages both call the same repositories, which call the same
domain functions. The dashboard cannot disagree with the API because there is
nothing for it to disagree with.

### Why pages read the repository directly

Screens are Server Components that call repositories, not their own REST API. A
server calling itself over HTTP adds a network round trip, a second
serialisation pass and a duplicate auth check to reach data it can already read.

The REST API is not bypassed logic. Every **mutation** in the UI goes through it
(`src/lib/api-client.ts`), so the endpoints you can exercise with curl are
the same ones the product itself uses to write. If an endpoint breaks, the UI
breaks with it.

---

## Money handling

**There is no such thing as a "dollars number" in this codebase.**

Money exists in exactly two forms: an integer count of cents (always named
`*Cents`), or a string: raw user input on the way in, formatted output on the
way out. A `number` holding `12.34` never exists anywhere, which removes the
entire class of bug where dollars and cents get mixed at a call site.

Floating point never touches a value. Parsing splits the decimal string and
combines the parts with integer arithmetic; formatting slices the integer as a
string. Neither ever multiplies or divides by 100.

This is not theoretical:

```js
Math.floor(parseFloat("0.29") * 100)   // 28, because 0.29 * 100 is 28.999999999999996
33.33 + 33.33 + 33.33                  // 99.99000000000001, which !== 99.99
```

The second one is the one that matters here. Three payments of $33.33 against a
$100 order must leave exactly one cent outstanding, and a float implementation
either never settles the order or settles it a cent early. The seeded demo
account contains this exact case (Copperline Ltd, ORD-0007) so you can see it
behave.

Amounts cross the API as **integer cents**: `{"amountCents": 40000}`. A decimal
string on the wire invites every consumer to write its own parser and get `0.29`
wrong. Clients parse typed input once, with the shared parser, before sending.

**Limits.** A single stored amount is capped at `999,999,999` cents
($9,999,999.99), comfortably below PostgreSQL's `INTEGER` ceiling of
`2,147,483,647` so a column can never overflow. Line quantity is capped at
`100,000`.

**Rounding.** There is none, because there is nothing to round: there is no tax
and no discount here, and both operands of `quantity × unitPriceCents` are
already integers. Input with more than two decimal places is rejected rather
than rounded, because silently turning an entered `10.999` into `11.00` changes
what the user said.

---

## Status derivation, and the edge cases

Status is **never stored**. It is computed on read, every time.

Two reasons. A stored total goes stale the moment a line item is edited. And
`overdue` would go stale merely because time passed, with no write to trigger an
update. The row would be wrong at 00:01 having been right at 23:59.

### The rule is the ordering

The four states genuinely overlap: an order can truthfully be both partially
paid and overdue. Precedence decides what the user sees:

```
1. paidCents >= totalCents        -> paid
2. today is past the due date     -> overdue
3. paidCents > 0                  -> partially_paid
4. otherwise                      -> pending
```

### Documented edge cases

| Case | Result | Reasoning |
|---|---|---|
| Was overdue, now fully paid | `paid` | Nothing is owed, so nothing can be late. Seeded as ORD-0005, settled 11 days ago against a due date 40 days ago. |
| Unpaid and past the due date | `overdue`, not `pending` | Lateness is the more urgent fact for the person reading the dashboard. |
| Part paid and past the due date | `overdue`, not `partially_paid` | Same reasoning. The amount paid is still shown in its own column, so no information is lost. |
| Over-paid (only possible from corrupted data) | `paid` | `>=`, not `==`, so a bad row degrades to a sensible reading rather than falling through to `pending`. |
| Order with a zero total | `paid` | Nothing is owed, so it is settled. |
| Amount due when over-paid | Clamped at `0` | A negative "amount due" on screen is a worse failure than a zero. |

### Dates and timezones

Due dates are stored as SQL `DATE` (no time component), which Prisma returns as
midnight UTC. Comparing that against a raw `new Date()` would tip an order into
`overdue` at midnight UTC **on its own due date**, a full day early. Both sides
are therefore reduced to a UTC calendar day before comparison, so the rule reads
exactly as it is written: past the due *date*.

**The trade-off:** "today" means UTC today. For one user in one timezone that is
at most a few hours of skew, on the one day an order falls due. Per-user
timezones are outside the scope of this exercise; the note in
`src/lib/domain/orders.ts` records where the change would go.

There is a test that specifically kills the naive `asOf > dueDate`
implementation, because that version passes every other status test.

---

## Concurrency: the over-payment race

The interesting question is what happens if two payments are submitted at the
same time, and
says documenting the approach is sufficient. **It is implemented**, and there is
a test proving it works.

### The race

An order has $600 outstanding. Two $600 payments arrive a millisecond apart:
a double-clicked button, or two people working the same account.

```
request A: reads balance -> $600 due -> $600 is allowed
request B: reads balance -> $600 due -> $600 is allowed   (A has not committed)
request A: inserts payment, commits
request B: inserts payment, commits
result:    $1,200 collected against a $600 balance
```

Both requests ran the validation. Both passed it. Validation alone cannot fix
this, because the balance each one read was already stale by the time it decided.

### The fix

`src/server/repositories/payments.ts` makes read-validate-write one indivisible
operation:

1. Open a transaction.
2. `SELECT ... FOR UPDATE` the order row, taking a row-level exclusive lock.
   Request B now **blocks here** until A commits.
3. Sum the payments **inside** the lock, so the balance is current by
   construction rather than by timing.
4. Validate and insert.
5. Commit, releasing the lock. B proceeds, re-reads, correctly sees $0 due, and
   is rejected with the right message.

The lock is taken on the **order** row, not on payments: you cannot lock rows
that do not exist yet, and the invariant being protected is "the sum of this
order's payments". Read Committed isolation is sufficient, because `FOR UPDATE`
provides the mutual exclusion, and a higher level would add serialisation
failures to handle without adding safety for this invariant.

### Proof

Removing `FOR UPDATE` and changing nothing else:

```
× rejects the loser when two full payments race
    expected 1 fulfilled, got 2
× never lets ten concurrent payments exceed the order total
    expected 5 accepted, got 6      ($1,200 collected on a $1,000 order)
```

With it, both pass. The HTTP smoke test fires six simultaneous full payments at
a live server and asserts exactly one is accepted.

---

## Order immutability

**An order becomes read-only once its first payment is recorded.** Edits and
deletes are both refused with `409 ORDER_LOCKED`, enforced in the repository,
not by hiding buttons.

Either policy is defensible provided it is explained. The alternative, allowing
edits, but reject any that would drop the total below what has already been
edits but rejecting any that drop the total below what has been collected, needs a
second validation path on every write, and can still leave a
customer's receipt disagreeing with the order. Freezing matches how invoicing
actually works: a settled document is corrected by a credit note, not by editing
history.

Payments themselves are append-only. They are a record of what happened.

---

## API reference

All responses are JSON. Money is always integer cents.

### Authentication

Two transports, both first-class:

- **Cookie.** `POST /api/auth/login` sets an httpOnly, `sameSite=lax` session
  cookie. This is what the browser uses.
- **Bearer.** The same response returns `{ token }` in the body. Send it as
  `Authorization: Bearer <token>`. The header takes precedence over the cookie.

The bearer path exists so the API is testable from a terminal in one command,
without a cookie jar.

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"demo@folio.app","password":"demo1234"}' | jq -r .token)

curl -s localhost:3000/api/orders -H "authorization: Bearer $TOKEN" | jq
```

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/signup` | Create an account. Returns `201` with a token. |
| `POST` | `/api/auth/login` | Sign in. Returns a token and sets the cookie. |
| `POST` | `/api/auth/logout` | Clear the session cookie. |
| `GET` | `/api/auth/me` | Who the current token belongs to. |
| `GET` | `/api/orders` | List orders. `?status=pending\|partially_paid\|paid\|overdue\|all` |
| `POST` | `/api/orders` | Create an order with line items. |
| `GET` | `/api/orders/:id` | One order, with lines and payment history. |
| `PATCH` | `/api/orders/:id` | Replace details and lines. `409` once paid. |
| `DELETE` | `/api/orders/:id` | Delete. `409` once paid. |
| `POST` | `/api/orders/:id/payments` | Record a payment. Returns the updated order. |
| `GET` | `/api/orders/export` | CSV. `?status=`, `?from=`, `?to=` |

### Error shape

Every failure uses the same envelope:

```json
{
  "error": {
    "code": "PAYMENT_EXCEEDS_BALANCE",
    "message": "Payment of $700.00 exceeds the amount due. The most you can record for this order is $600.00.",
    "fields": { "amountCents": "…" },
    "details": { "maxAllowedCents": 60000, "totalCents": 100000, "alreadyPaidCents": 40000 }
  }
}
```

`fields` maps a message to the input that caused it, so a form can attach it to
the right box. `details` carries structured values a programmatic client can act
on, which is why the maximum allowed amount appears both in prose and as a
number.

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 / 422 | Malformed JSON, or field validation failed. |
| `UNAUTHENTICATED` | 401 | No valid session. |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password. |
| `EMAIL_TAKEN` | 409 | That email is already registered. |
| `NOT_FOUND` | 404 | No such order, **or** it is not yours. |
| `ORDER_LOCKED` | 409 | The order has payments and cannot be changed. |
| `PAYMENT_BELOW_MINIMUM` | 422 | Payment must be at least $0.01. |
| `PAYMENT_EXCEEDS_BALANCE` | 422 | Would over-pay. `details.maxAllowedCents` says by how much. |
| `ORDER_ALREADY_SETTLED` | 422 | Nothing is outstanding. |
| `INTERNAL_ERROR` | 500 | A bug. Logged in full server-side, opaque to the client. |

Another user's order returns `404`, never `403`. A `403` would confirm the
order exists.

---

## Testing

```
153  unit tests         pure logic, no I/O, ~200ms
30   integration tests  real PostgreSQL, real transactions, real locks
56   smoke checks       end-to-end over HTTP against a running server
32   screenshots        every page, both themes, desktop and phone
140  responsive checks  7 pages x 10 widths x 2 themes
```

### Running them

```bash
bun run test              # unit

createdb crossval_test
cp .env.example .env.test   # point DATABASE_URL at crossval_test
bun run test:integration    # refuses to run unless the URL contains "test"

bun run dev &
bun run smoke
bun run shoot             # writes .screenshots/, fails on any console error
bun run responsive        # overflow, touch targets, iOS zoom, at 10 widths
```

`bun run shoot` exists because the other three cannot see. A class-merging bug
once rendered the primary button as black text on a black background, and the
typechecker, the linter and every unit test passed straight through it. The only
thing that catches that class of fault is looking at the pixels, so looking at
the pixels is a command.

### These tests were verified by mutating the source

A test that cannot fail is decoration. Each of these mutations was applied to
working code to confirm the suite catches it:

| Mutation | Tests that failed |
|---|---|
| Drop decimal padding, so `1000.5` parses as `1000.05` | 2 |
| Use `Math.floor(Number(x) * 100)` instead of integer math | 7 |
| Compare `asOf > dueDate` directly instead of by calendar day | 2 |
| Check `overdue` before `paid` in the precedence chain | 3 |
| Use `>` instead of `>=` for the paid comparison | 4 |
| **Remove `FOR UPDATE` from the payment lock** | **2** |
| **Remove the row lock from `updateOrder` / `deleteOrder`** | **3** |
| Revert the `cn()` fix | 9 |
| Rank part paid below pending in the list sort | 1 |
| Sort settled orders oldest first | 1 |
| Put overdue last in the list sort | 2 |
| Import the theme storage key from the client module | 2 (smoke) |
| Move an ageing bucket boundary by one day | 1 |
| Include settled orders in the ageing report | 2 |
| Add one to `daysOverdue` | 14 |
| Raise the threshold so the final chase tone is unreachable | 1 |
| Chase for the order total instead of the balance | 2 |
| Allow one extra login attempt past the limit | 4 |
| Key the rate limiter on the last forwarded hop | 1 |
| Drop the scope from the rate limit key | 5 |

### A critical bug found by adversarial review

After the payment lock was written, tested and documented, a review pass over
the whole codebase found that **the lock was only on the payment path.**
`updateOrder` and `deleteOrder` both read `_count.payments` with a plain,
unlocked `SELECT` and only touched the order row afterwards.

Reproduced 40 times out of 40 against a running server:

```
order: 1 line, 2 x $500.00 = $1,000.00, no payments

  PATCH  /api/orders/:id      replace lines with 1 x $1.00   -> 200
  POST   /api/orders/:id/payments   $1,000.00                -> 201   (concurrent)

  GET    /api/orders/:id
    totalCents: 100      paidCents: 100000      dueCents: 0
    status: "paid"       editable: false
```

$1,000 collected against a $1 order, reported as settled because `dueCents`
clamps at zero, and frozen so it could not be corrected through the product.
Both requests succeeded. Neither did anything the API considered wrong.

`deleteOrder` was worse in kind: its guard and its `DELETE` were not even in a
transaction, and `Payment.orderId` cascades, so a payment that committed between
the two was erased after having been acknowledged with a 201.

The fix extracts the lock into `src/server/repositories/lock.ts` and calls it
first in every write path, so a new write path cannot omit it without visibly
not calling it. `src/server/repositories/locking.integration.test.ts` covers
both races and fails without the fix.

**The lesson worth keeping:** "this codebase takes a row lock" is not a property
of a codebase. It is a property of each individual write path, and having
written one correctly is not evidence about the others.

Fifteen further defects from the same review were fixed, including: an order
whose aggregate total exceeded `Number.MAX_SAFE_INTEGER` could be committed and
would then make the whole account unreadable; `ORDER BY reference DESC` sorts
text, so a user hitting `ORD-9999` could never create another order; `"1,50"`
parsed as `$150.00`; the payment dialog stuck on "Recording" after the first
successful payment; and the table's keyboard focus ring had been removed with
nothing put in its place.

The integration tests use a real database rather than a mock deliberately: the
single most important behaviour here is enforced by PostgreSQL, and a mocked
client would let every concurrency test pass while the real system loses money.

### A bug this process caught

The primary button rendered as a black rectangle with black text. Nothing
errored, nothing failed to compile, and every test passed. `tailwind-merge`
classifies `text-*` as either a font size or a colour by pattern-matching the
value; `text-body-sm` does not look like a t-shirt size, so it was filed as a
colour, judged to conflict with `text-action-ink`, and the colour was silently
deleted from the DOM. Every component combining a size and a colour was
affected.

The fix is in `src/lib/utils.ts` (declaring the custom scales explicitly), with
regression tests in `src/lib/utils.test.ts`. It was found by taking a real
screenshot, which is now part of how this was verified rather than an
afterthought.

---

## Design system

Three tiers, in `src/styles/`:

```
primitives.css     raw values, referenced by nothing but tokens
tokens.css         semantic layer, named by job, the app's vocabulary
shadcn-bridge.css  re-points vendor variables at the semantic layer
theme.css          exposes tokens to Tailwind as utility classes
base.css           global defaults, press feedback, grain, reduced motion
```

`globals.css` holds no values at all, only ordered imports. A palette change
happens in one file, and both themes swap together because every component
reads the middle tier and nothing else. `/tokens` renders the whole system as a
live reference, with a theme toggle in its header: flip it and every swatch,
control and animation on the page moves at once.

Brand assets are generated rather than hand-exported. `bun run brand` renders
the favicon, app icons, maskable icon and social card from the mark geometry in
`src/components/brand/mark.tsx`, and converts the gradient plates in
`assets/gradients` to WebP. One command, and every raster stays consistent with
the source.

A few decisions worth stating:

- **Both themes are first class.** The palette swaps under `[data-theme="dark"]`,
  stamped on `<html>` by a blocking inline script before first paint, so a dark
  reader never sees a white frame. The dark values are not an inversion: raised
  surfaces get lighter rather than darker, because light travels up, and
  hairlines become translucent white so one token works over any depth.
- **The theme toggle reveals rather than crossfades.** A circle of the new theme
  expands from the exact pixel that was clicked, via the View Transitions API.
  Firefox has not shipped it and reduced-motion users opt out, so both simply
  flip the attribute.
- **The type scale is deliberately small.** Body is 14px, secondary text 13px,
  metadata 12px, and section headings 17px. This is a dense financial tool, and
  a 36px heading leaves no room to make anything else feel important. Hierarchy
  comes from weight, colour and space.
- **Nothing is set in capitals.** Letter-spaced uppercase labels are a shortcut
  to looking designed and they cost real legibility: capitals have no ascenders
  or descenders, so the word loses the silhouette the eye actually reads.
- **Two typefaces, and only two.** Instrument Serif for display, Inter for
  everything else. A monospace face carried references and receipts for a while
  and it was the wrong tool twice over: it is drawn for code, it reads as a
  terminal in an interface, and it fights both of the other two. The one thing
  it genuinely provided, figures of identical width, comes from Inter through
  `tabular-nums`.
- **`surface-inset` reverses direction between themes, deliberately.** A table
  header is not recessed, it is the same plane as its panel with a mark on it,
  so it steps darker on paper and lighter on charcoal. Reusing the recessed
  token made every header in dark mode read as a hole punched in the card.
- **Elevation is tint, not shadow.** Surfaces separate by getting fractionally
  darker and carrying a hairline border. Shadows are reserved for things that
  genuinely float (dialogs, popovers).
- **Filled controls carry relief.** One inset highlight along the top edge, in
  the `inset-shadow` namespace so it composes with a drop shadow rather than
  replacing it. Nobody consciously sees it; remove it and the button reads as a
  coloured rectangle.
- **Press feedback is physical.** 2% down in 100ms with a hard ease-out, and the
  relief goes out at the same time, which is what a key does when it drops below
  the plane of the light. Release takes 160ms with a slight overshoot. The
  travel is 2% rather than 3% because on a wide button 3% moves each edge far
  enough to read as the layout shifting rather than as pressure.
- **The accent inside the product is ink.** Primary action, selection and active
  state are all black, which leaves the four status colours as the only chroma
  on a money screen, so colour reads instantly as information.
- **Brand colour lives on the landing page only.** The three washes are sampled
  from the gradient photographs in `assets/gradients` rather than picked from a
  colour wheel, which is why they agree with the artwork and with each other.
- **The gradients are photographs, not CSS.** A generated gradient is
  mathematically smooth, which is exactly what the eye reads as synthetic, and
  it bands on an 8-bit display. A photograph of coloured light has grain and
  drift in it, which is what makes light look like light.
- **A blurred, masked plate has two opposite failure modes, and I hit both.**
  `mask-repeat` defaults to `repeat`, so the blur bleeding past the border box
  meets a fresh opaque tile of the mask and draws a seam exactly on the box
  edge. Setting `no-repeat` while the falloff still runs to 88% swaps that for a
  worse fault: the mask cuts the blur off at the edge, and the glow reads as a
  rectangle. It needs both, `no-repeat` AND a falloff that reaches zero at 70%
  of the radius, so the outer third of the box is already transparent and there
  is nothing left for either boundary to cut.
- **The light is not allowed to belong to one section.** No section carries
  `overflow-hidden`; the page wrapper uses `overflow-x: clip`, which stops
  sideways scrolling without creating a scroll container the way `hidden` would,
  so a plate is free to bleed down into whatever comes next. The body picks up
  the landing ground through `:has()`, because a plate hanging past the wrapper
  would otherwise paint onto the product's page colour and show a seam.
- **Grain is on everything.** A fixed fractal-noise tile at 5.5%, multiplying on
  paper and screening on charcoal. It is the difference between a large flat
  field reading as a printed surface and reading as a screenshot.
- **Status colour is never the only signal.** Every badge carries a label and a
  dot as well, so the four states remain distinguishable without colour vision.
- **Status is a dot in lists and a pill only on a detail page.** Forty tinted
  pills stacked down a table read as decoration; a dot carries the same
  information at a fraction of the weight and keeps the column scannable.
- **The status filter's indicator travels.** A highlight that teleports says
  nothing about the relationship between where you were and where you are. It
  is one element driven by measurement, not a background class toggled per
  option, which is what makes the motion continuous. It does not animate on
  first paint, because the first position is not a change.
- **The date field is hand-rolled.** `<input type="date">` renders differently
  in every browser, shows a locale-dependent numeric format that means different
  dates in different countries, and cannot be styled. On a screen where the due
  date decides whether an order reads as overdue, an ambiguous date format is a
  correctness problem.
- **Layout never shifts.** The scrollbar gutter is reserved so opening a dialog
  cannot widen the viewport, and pending button labels are stacked in one grid
  cell so "Create order" becoming "Creating" cannot change a button's width.
- **Radius is a five-step scale**, not one value everywhere. Small controls sit
  tighter than the panels containing them.
- **Reduced motion is surgical.** Movement is removed because that is what
  causes discomfort; opacity and colour transitions survive, shortened, because
  those carry meaning.
- **Money uses tabular figures** so decimal points stack down a column.

Typography is Instrument Serif for display sizes and Inter for everything else,
with a monospace face for references, amounts in fixed contexts, and eyebrow
labels. The pairing is the point: a distinctive display face against a neutral
text face is what stops an interface reading as a default.

### A second bug, found by looking at the bytes

The pre-paint theme script shipped for a while as:

```js
localStorage.getItem(undefined)
```

The root layout is a Server Component and imported `THEME_STORAGE_KEY` from
`components/theme/theme-provider.tsx`, which carries `"use client"`. A Server
Component importing a **non-component value** from a client module does not get
the value: the bundler swaps the module for a client reference proxy, and every
export that is not a component comes back `undefined`.

Nothing errored. `getItem(undefined)` returns null, the script fell through to
`prefers-color-scheme`, and the theme still looked right for anyone whose OS
matched their choice. The typechecker was happy (`string | undefined` widens
into a template literal without complaint), the linter was happy, the unit tests
never touch the document shell, and the screenshot pass **could not see it**
because Playwright sets `prefers-color-scheme` alongside `localStorage`, so dark
mode rendered dark for the wrong reason. The only symptom was that an explicit
choice quietly failed to survive a refresh.

Two changes came out of it. The constants moved to `src/lib/theme.ts`, a module
neither side marks, which is where anything crossing that boundary belongs. And
the smoke suite now fetches a page and reads the HTML: it asserts the script is
inlined, that it names a real storage key, and that no script this codebase
authored contains the string `undefined`. Reintroducing the bug fails two of
those checks.

---

## Assumptions and trade-offs

**Assumptions**

1. A customer is a name on an order, not an entity: a plain string. No customer
   table, no customer portal.
2. An order must have at least one line item. A zero-line order would have a
   total of zero and immediately read as `paid`, which is meaningless.
3. A line's unit price may be zero (for a free item on a paid order), but
   quantity must be at least one.
4. Payments are append-only and cannot be edited or deleted.
5. Order references (`ORD-0001`) are per user and never reused after a deletion.
6. "Today" is UTC today, as discussed above.
7. The signup password rule is a length minimum only. Composition rules push
   people towards worse passwords.

**Trade-offs**

| Decision | Why | What it costs |
|---|---|---|
| Hand-rolled JWT auth instead of Auth.js | This exposes a public REST API, so it has to be usable from a terminal. Auth.js is cookie + CSRF based, making that painful. Its credentials provider also leaves the bcrypt comparison and user lookup to be written by hand anyway. At the time of writing, the App Router version (v5) is still a beta release. | Roughly 80 lines to own and keep correct. |
| Status filtered in application code, not SQL | Three of four states depend on summing child rows against the current date. Expressing that in `WHERE` means either a denormalised column that goes stale, or a correlated subquery per row. | Every list query loads all of a user's orders. Fine at this scale; see below for what changes. |
| Order lines replaced wholesale on update | The client sends the full intended list. Delete-then-insert in one transaction has no partial-update states to reason about. | Line item IDs are not stable across an edit. Nothing depends on them. |
| Reference allocation retries on conflict | Two concurrent creates can derive the same next number. Rather than serialising every create behind a lock for a cosmetic field, the unique constraint rejects the loser and the write retries. | Up to five attempts in pathological contention. |
| Dark mode defined but not shipped | Every reference for this product is light, and a half-tuned dark mode is worse than none. The tokens are defined so the app degrades coherently rather than illegibly. | No dark mode. |

---

## What I would do before production

Roughly in order of how much it would matter:

1. **Move rate limiting off the instance.** Login, signup and authenticated
   writes are limited, but the counters live in memory in one process. They do
   not survive a restart, they are per instance, and a fixed window allows a
   burst across its boundary. It is still the difference between unlimited
   password guesses and ten per fifteen minutes, and the fix is one function:
   swap `hit()` in `src/server/api/rate-limit.ts` for a Redis `INCR` with
   `EXPIRE` and every call site stays as it is.
2. **Make logout actually revoke.** Tokens are stateless, so `POST /logout`
   clears the cookie but a captured bearer token stays valid until it expires.
   Production needs either short-lived access tokens with refresh, or a
   server-side denylist keyed on a token id.
3. **Maintain `paid_cents` on the order transactionally.** Written inside the
   same locked transaction that inserts a payment, it stays correct by
   construction while making the status filter a plain indexed predicate. Only
   `overdue` would remain derived, and that is a date comparison an index
   already covers. This is the change that makes the list query scale.
4. **Paginate the order list.** It currently returns everything. Cursor
   pagination on `(dueDate, id)`, which the existing composite index supports.
5. **An audit log.** Who recorded which payment and when. For anything touching
   money this stops being optional the moment more than one person has access.
6. **Idempotency keys on the payment endpoint.** The row lock stops double
   *collection*, but a client that retries a timed-out request can still record a
   genuine second payment. An `Idempotency-Key` header would close that.
   Related: `recordPayment` commits and then reloads the order to build its
   response, so a failure in that reload reports an error for a payment that is
   already durably recorded. Returning the payment id from inside the
   transaction would remove the window.
7. **`Cache-Control: private, no-store` on authenticated responses.** They
   currently carry no cache directives and a `Vary` that omits `Cookie` and
   `Authorization`. Nothing between the app and the browser caches them today,
   but that is a property of the current deployment rather than of the code.
8. **Structured logging and error tracking.** `console.error` is not an
   observability strategy.
9. **Per-user timezones**, so "overdue" means overdue where the user is. Date
   inputs already default to the user's local calendar day; comparison is still
   UTC.
10. **Refunds**, as their own entity rather than negative payments, so
    `sum(payments)` keeps meaning "money received".
11. **Browser tests** for the critical flows. The smoke test covers the API
    thoroughly, and `bun run responsive` asserts real layout properties at ten
    widths, but neither drives a full user journey through the UI.

---

## Deployment

Built for Vercel and Neon. Nothing here is Vercel-specific; it is a standard
Next.js app talking to PostgreSQL over Prisma.

### 1. Neon

Create a project at [neon.tech](https://neon.tech) and copy **both** connection
strings from the dashboard:

| Variable | Which string | Why |
|---|---|---|
| `DATABASE_URL` | the **pooled** one, host contains `-pooler` | Serverless functions open a connection per invocation. Without the pooler you exhaust Postgres' connection limit under any real traffic. |
| `DIRECT_URL` | the **unpooled** one | Migrations need a real session. PgBouncer in transaction mode cannot run the statements Prisma emits for a migration. |

Append `?sslmode=require` to both, and `&pgbouncer=true` to the pooled one.

### 2. Vercel

Import the repository, then set three environment variables for **all**
environments (production, preview and development):

```
DATABASE_URL   the pooled Neon string
DIRECT_URL     the unpooled Neon string
AUTH_SECRET    openssl rand -base64 48
```

`AUTH_SECRET` signs every session. Use a different one per environment, and
never reuse the one from your machine: rotating it invalidates every session,
which is the correct behaviour and also what happens if it leaks.

No build configuration is needed. `postinstall` runs `prisma generate`, and
`next build` does the rest.

### 3. Schema and seed data

Run once, from your machine, against the production database:

```bash
DIRECT_URL="postgresql://…" bunx prisma migrate deploy
DIRECT_URL="postgresql://…" bun run db:seed     # optional demo account
```

`migrate deploy` applies committed migrations and never generates new ones, so
it is safe to run against production. The seed is idempotent and only creates
the demo account; skip it if you do not want one.

### Checklist

- [ ] Both connection strings set, pooled and unpooled the right way round
- [ ] `AUTH_SECRET` at least 32 characters, unique to the environment
- [ ] `bunx prisma migrate deploy` run against the production database
- [ ] `/api/auth/me` returns 401 when signed out, 200 when signed in

### Things worth knowing

**Neon's free tier suspends after ~5 minutes idle**, so the first request after
a quiet period pays an extra second while the database wakes. That is the
platform, not the application.

**Rate limiting is per instance and in memory.** On a platform that runs several
instances an attacker gets the limit multiplied by the number they reach. See
[what I would do before production](#what-i-would-do-before-production) for the
one-function fix.
