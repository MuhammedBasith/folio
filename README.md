# Ledger — orders and settlements

A small web application for tracking what customers owe you. Create orders with
line items, record payments against them as the money arrives, and see at a
glance which invoices are short and which ones are late.

**Live URL:** _add before submitting_

**Demo sign in:** `demo@ledger.app` / `demo1234`
The demo account is seeded with seven orders covering every status, including
one that was overdue and is now settled, and one with a single cent outstanding.

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

---

## What this is

One business owner signs in and keeps a private record of their own orders. The
customer is a name on an order, not an account: customers never see this
application, receive nothing from it, and cannot log in. "Recording a payment"
means the owner writing down that money arrived, not the customer paying through
the app. No money moves through this system.

Authentication exists so that several unrelated businesses can use the same
deployment without ever seeing each other's data.

---

## Running it locally

### Prerequisites

- Node.js 20 or newer (developed on 22.14)
- PostgreSQL 14 or newer

### Setup

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
#    Fill in DATABASE_URL and DIRECT_URL, then generate a signing key:
#    openssl rand -base64 48

# 3. Create the schema
npm run db:deploy

# 4. Seed the demo data (optional but recommended)
npm run db:seed

# 5. Run
npm run dev
```

Open http://localhost:3000 and sign in with `demo@ledger.app` / `demo1234`.

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooled connection. On Neon this is the `-pooler` host, with `?pgbouncer=true` appended so Prisma disables prepared statements. |
| `DIRECT_URL` | Unpooled connection, used only for migrations. A pooler cannot reliably run DDL. Locally the two are the same string. |
| `AUTH_SECRET` | HS256 signing key for session tokens. At least 32 characters; the app refuses to start otherwise. |

### Commands

```bash
npm run dev               # development server
npm run build             # production build
npm run verify            # typecheck + lint + unit tests

npm run test              # unit tests (pure logic, no I/O)
npm run test:integration  # integration tests (needs a test database, see Testing)
npm run test:all          # both

npm run db:migrate        # create and apply a migration
npm run db:deploy         # apply existing migrations
npm run db:seed           # load demo data
npm run db:studio         # browse the database

node scripts/smoke.mjs [baseUrl]   # end-to-end API smoke test over HTTP
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
(`src/lib/api-client.ts`), so the endpoints a reviewer exercises with curl are
the same ones the product itself uses to write. If an endpoint breaks, the UI
breaks with it.

---

## Money handling

**There is no such thing as a "dollars number" in this codebase.**

Money exists in exactly two forms: an integer count of cents (always named
`*Cents`), or a string — raw user input on the way in, formatted output on the
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

**Rounding.** There is none, because there is nothing to round: this assignment
has no tax and no discount, and both operands of `quantity × unitPriceCents` are
already integers. Input with more than two decimal places is rejected rather
than rounded, because silently turning an entered `10.999` into `11.00` changes
what the user said.

---

## Status derivation, and the edge cases

Status is **never stored**. It is computed on read, every time.

Two reasons. A stored total goes stale the moment a line item is edited. And
`overdue` would go stale merely because time passed, with no write to trigger an
update — the row would be wrong at 00:01 having been right at 23:59.

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
| Was overdue, now fully paid | `paid` | Nothing is owed, so nothing can be late. The brief names this one explicitly. Seeded as ORD-0005, settled 11 days ago against a due date 40 days ago. |
| Unpaid and past the due date | `overdue`, not `pending` | Lateness is the more urgent fact for the person reading the dashboard. |
| Part paid and past the due date | `overdue`, not `partially_paid` | Same reasoning. The amount paid is still shown in its own column, so no information is lost. |
| Over-paid (only possible from corrupted data) | `paid` | `>=`, not `==`, so a bad row degrades to a sensible reading rather than falling through to `pending`. |
| Order with a zero total | `paid` | Nothing is owed, so it is settled. |
| Amount due when over-paid | Clamped at `0` | A negative "amount due" on screen is a worse failure than a zero. |

### Dates and timezones

Due dates are stored as SQL `DATE` (no time component), which Prisma returns as
midnight UTC. Comparing that against a raw `new Date()` would tip an order into
`overdue` at midnight UTC **on its own due date** — a full day early. Both sides
are therefore reduced to a UTC calendar day before comparison, so the rule reads
exactly as the brief states it: past the due *date*.

**The trade-off:** "today" means UTC today. For one user in one timezone that is
at most a few hours of skew, on the one day an order falls due. Per-user
timezones are outside the scope of this exercise; the note in
`src/lib/domain/orders.ts` records where the change would go.

There is a test that specifically kills the naive `asOf > dueDate`
implementation, because that version passes every other status test.

---

## Concurrency: the over-payment race

The brief asks what happens if two payments are submitted at the same time, and
says documenting the approach is sufficient. **It is implemented**, and there is
a test proving it works.

### The race

An order has $600 outstanding. Two $600 payments arrive a millisecond apart —
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
order's payments". Read Committed isolation is sufficient — `FOR UPDATE`
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
deletes are both refused with `409 ORDER_LOCKED`, enforced in the repository —
not by hiding buttons.

The brief allows either policy provided it is explained. The alternative — allow
edits, but reject any that would drop the total below what has already been
collected — needs a second validation path on every write, and can still leave a
customer's receipt disagreeing with the order. Freezing matches how invoicing
actually works: a settled document is corrected by a credit note, not by editing
history.

Payments themselves are append-only. They are a record of what happened.

---

## API reference

All responses are JSON. Money is always integer cents.

### Authentication

Two transports, both first-class:

- **Cookie** — `POST /api/auth/login` sets an httpOnly, `sameSite=lax` session
  cookie. This is what the browser uses.
- **Bearer** — the same response returns `{ token }` in the body. Send it as
  `Authorization: Bearer <token>`. The header takes precedence over the cookie.

The bearer path exists so the API is testable from a terminal in one command,
without a cookie jar.

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"demo@ledger.app","password":"demo1234"}' | jq -r .token)

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
on — which is why the maximum allowed amount appears both in prose and as a
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
95  unit tests         pure logic, no I/O, ~200ms
24  integration tests  real PostgreSQL, real transactions, real locks
47  smoke checks       end-to-end over HTTP against a running server
```

### Running them

```bash
npm run test              # unit

createdb crossval_test
cp .env.example .env.test   # point DATABASE_URL at crossval_test
npm run test:integration    # refuses to run unless the URL contains "test"

npm run dev &
node scripts/smoke.mjs
```

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
| Revert the `cn()` fix | 9 |

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
base.css           global defaults, press feedback, reduced motion
```

`globals.css` holds no values at all, only ordered imports. A palette change
happens in one file. `/tokens` renders the whole system as a live reference.

A few decisions worth stating:

- **Elevation is tint, not shadow.** Surfaces separate by getting fractionally
  darker and carrying a hairline border. Shadows are reserved for things that
  genuinely float (dialogs, dropdowns).
- **The accent is ink.** Primary action, selection and active state are all
  black, which leaves the four status colours as the only chroma on screen — so
  colour reads instantly as information rather than decoration.
- **Status colour is never the only signal.** Every badge carries a label and a
  dot as well, so the four states remain distinguishable without colour vision.
- **Press feedback is asymmetric.** 100ms down with a hard ease-out, 160ms back
  with a slight overshoot. Fast acknowledgement, unhurried settle. Bounce is
  kept low because this is a money screen.
- **Radius is a five-step scale**, not one value everywhere. Small controls sit
  tighter than the panels containing them.
- **Reduced motion is surgical.** Movement is removed because that is what
  causes discomfort; opacity and colour transitions survive, shortened, because
  those carry meaning.
- **Money uses tabular figures** so decimal points stack down a column.

Typography is Instrument Serif for display sizes and Inter for everything else,
with a monospace face for references and identifiers only.

---

## Assumptions and trade-offs

**Assumptions**

1. A customer is a name on an order, not an entity. The brief says "plain string
   is fine". No customer table, no customer portal.
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
| Hand-rolled JWT auth instead of Auth.js | The brief requires a REST API and grades API design, so a reviewer will use curl. Auth.js is cookie + CSRF based, making terminal testing painful. Its credentials provider also leaves the bcrypt comparison and user lookup to be written by hand anyway. At the time of writing, the App Router version (v5) is still a beta release. | Roughly 80 lines to own and keep correct. |
| Status filtered in application code, not SQL | Three of four states depend on summing child rows against the current date. Expressing that in `WHERE` means either a denormalised column that goes stale, or a correlated subquery per row. | Every list query loads all of a user's orders. Fine at this scale; see below for what changes. |
| Order lines replaced wholesale on update | The client sends the full intended list. Delete-then-insert in one transaction has no partial-update states to reason about. | Line item IDs are not stable across an edit. Nothing depends on them. |
| Reference allocation retries on conflict | Two concurrent creates can derive the same next number. Rather than serialising every create behind a lock for a cosmetic field, the unique constraint rejects the loser and the write retries. | Up to five attempts in pathological contention. |
| Dark mode defined but not shipped | Every reference for this product is light, and a half-tuned dark mode is worse than none. The tokens are defined so the app degrades coherently rather than illegibly. | No dark mode. |

---

## What I would do before production

Roughly in order of how much it would matter:

1. **Rate limit the auth endpoints.** Login is currently unlimited, which makes
   credential stuffing free. This is the first thing I would add.
2. **Make logout actually revoke.** Tokens are stateless, so `POST /logout`
   clears the cookie but a captured bearer token stays valid until it expires.
   Production needs either short-lived access tokens with refresh, or a
   server-side denylist keyed on a token id.
3. **Maintain `paid_cents` on the order transactionally.** Written inside the
   same locked transaction that inserts a payment, it stays correct by
   construction while making the status filter a plain indexed predicate — only
   `overdue` would remain derived, and that is a date comparison an index
   already covers. This is the change that makes the list query scale.
4. **Paginate the order list.** It currently returns everything. Cursor
   pagination on `(dueDate, id)`, which the existing composite index supports.
5. **An audit log.** Who recorded which payment and when. For anything touching
   money this stops being optional the moment more than one person has access.
6. **Idempotency keys on the payment endpoint.** The row lock stops double
   *collection*, but a client that retries a timed-out request can still record a
   genuine second payment. An `Idempotency-Key` header would close that.
7. **Structured logging and error tracking.** `console.error` is not an
   observability strategy.
8. **Per-user timezones**, so "overdue" means overdue where the user is.
9. **Refunds**, as their own entity rather than negative payments, so
   `sum(payments)` keeps meaning "money received".
10. **Browser tests** for the critical flows. The smoke test covers the API
    thoroughly; the UI is currently verified by screenshot rather than by
    assertion.

---

## Deployment

Built for Vercel with Neon PostgreSQL, though nothing is Vercel-specific.

1. Create a Neon project and copy both connection strings.
2. Import the repository into Vercel.
3. Set `DATABASE_URL` (pooled, with `?pgbouncer=true`), `DIRECT_URL` (unpooled)
   and `AUTH_SECRET`.
4. Deploy. `postinstall` runs `prisma generate`.
5. Apply the schema and seed:
   ```bash
   DIRECT_URL="…" npx prisma migrate deploy
   DIRECT_URL="…" npm run db:seed
   ```

**One thing worth knowing:** Neon's free tier suspends a database after about
five minutes of inactivity, so the first request after a quiet period pays an
extra second or so while it wakes. That is the platform, not the application.
