/**
 * End-to-end API smoke test.
 *
 * Walks the brief's sample scenario over real HTTP against a running server,
 * using a bearer token exactly as a reviewer would with curl or Postman.
 *
 *   node scripts/smoke.mjs [baseUrl]
 *
 * Defaults to http://localhost:3000. Exits non-zero on the first failure.
 *
 * This exists because the integration suite tests the repository layer
 * directly. That proves the locking and the domain rules, but it never touches
 * routing, auth transport, status codes or JSON shape. This does.
 */

const BASE = process.argv[2] ?? "http://localhost:3000";

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

async function call(path, { method = "GET", body, token } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }

  return { status: response.status, json, text, headers: response.headers };
}

async function main() {
  console.log(`Smoke testing ${BASE}`);

  const email = `smoke-${Date.now()}@example.com`;
  const password = "smoke-test-1234";

  /* ---- auth ---- */
  section("Authentication");

  const anon = await call("/api/orders");
  check("unauthenticated order list is rejected", anon.status === 401,
    `got ${anon.status}`);
  check("rejection uses the standard envelope",
    anon.json?.error?.code === "UNAUTHENTICATED",
    JSON.stringify(anon.json));

  const signup = await call("/api/auth/signup", {
    method: "POST",
    body: { email, password },
  });
  check("signup returns 201", signup.status === 201, `got ${signup.status}`);
  check("signup returns a bearer token", typeof signup.json?.token === "string");

  const token = signup.json?.token;

  const dupe = await call("/api/auth/signup", {
    method: "POST",
    body: { email, password },
  });
  check("duplicate email returns 409 EMAIL_TAKEN",
    dupe.status === 409 && dupe.json?.error?.code === "EMAIL_TAKEN",
    `got ${dupe.status} ${dupe.json?.error?.code}`);

  const badLogin = await call("/api/auth/login", {
    method: "POST",
    body: { email, password: "wrong-password" },
  });
  check("wrong password returns 401", badLogin.status === 401);
  check("wrong password does not reveal whether the email exists",
    !/email|account.*not.*found|no such/i.test(badLogin.json?.error?.message ?? "") ||
      /does not match/i.test(badLogin.json?.error?.message ?? ""),
    badLogin.json?.error?.message);

  const me = await call("/api/auth/me", { token });
  check("bearer token authenticates /me", me.status === 200 && me.json?.user?.email === email);

  const weak = await call("/api/auth/signup", {
    method: "POST",
    body: { email: `weak-${Date.now()}@example.com`, password: "short" },
  });
  check("short password is rejected with a field message",
    weak.status === 422 && typeof weak.json?.error?.fields?.password === "string",
    JSON.stringify(weak.json?.error));

  /* ---- the brief's scenario ---- */
  section("The brief's sample scenario");

  const created = await call("/api/orders", {
    method: "POST",
    token,
    body: {
      customer: "Acme Corp",
      dueDate: "2026-12-31",
      lineItems: [
        { description: "Laptop", quantity: 2, unitPriceCents: 50_000 },
      ],
    },
  });
  check("order created with 201", created.status === 201, `got ${created.status}`);

  const order = created.json?.order;
  check("total computed server side as $1,000.00", order?.totalCents === 100_000,
    `got ${order?.totalCents}`);
  check("status starts pending", order?.status === "pending", order?.status);
  check("amount due is the full total", order?.dueCents === 100_000);

  const pay400 = await call(`/api/orders/${order.id}/payments`, {
    method: "POST",
    token,
    body: { amountCents: 40_000, paidOn: "2026-08-10" },
  });
  check("$400 payment accepted with 201", pay400.status === 201);
  check("status becomes partially_paid",
    pay400.json?.order?.status === "partially_paid", pay400.json?.order?.status);
  check("$600 still due", pay400.json?.order?.dueCents === 60_000,
    `got ${pay400.json?.order?.dueCents}`);

  const pay600 = await call(`/api/orders/${order.id}/payments`, {
    method: "POST",
    token,
    body: { amountCents: 60_000, paidOn: "2026-08-12" },
  });
  check("$600 payment accepted", pay600.status === 201);
  check("status becomes paid", pay600.json?.order?.status === "paid");
  check("nothing left due", pay600.json?.order?.dueCents === 0);

  const overpay = await call(`/api/orders/${order.id}/payments`, {
    method: "POST",
    token,
    body: { amountCents: 100, paidOn: "2026-08-13" },
  });
  check("further $1 is rejected with 422", overpay.status === 422,
    `got ${overpay.status}`);
  check("rejection code is ORDER_ALREADY_SETTLED",
    overpay.json?.error?.code === "ORDER_ALREADY_SETTLED",
    overpay.json?.error?.code);
  check("rejection message is actionable",
    /already fully paid/i.test(overpay.json?.error?.message ?? ""),
    overpay.json?.error?.message);

  /* ---- over-payment on a partially paid order ---- */
  section("Over-payment guard");

  const second = await call("/api/orders", {
    method: "POST",
    token,
    body: {
      customer: "Beta Ltd",
      dueDate: "2026-12-31",
      lineItems: [{ description: "Service", quantity: 1, unitPriceCents: 60_000 }],
    },
  });
  const betaId = second.json?.order?.id;

  await call(`/api/orders/${betaId}/payments`, {
    method: "POST",
    token,
    body: { amountCents: 20_000, paidOn: "2026-08-10" },
  });

  const tooMuch = await call(`/api/orders/${betaId}/payments`, {
    method: "POST",
    token,
    body: { amountCents: 40_001, paidOn: "2026-08-11" },
  });
  check("one cent over the balance is rejected", tooMuch.status === 422);
  check("error names the maximum in the message",
    /\$400\.00/.test(tooMuch.json?.error?.message ?? ""),
    tooMuch.json?.error?.message);
  check("error carries maxAllowedCents for programmatic clients",
    tooMuch.json?.error?.details?.maxAllowedCents === 40_000,
    JSON.stringify(tooMuch.json?.error?.details));

  /* ---- concurrency over HTTP ---- */
  section("Concurrency");

  const raceOrder = await call("/api/orders", {
    method: "POST",
    token,
    body: {
      customer: "Race Condition Inc",
      dueDate: "2026-12-31",
      lineItems: [{ description: "Widget", quantity: 1, unitPriceCents: 50_000 }],
    },
  });
  const raceId = raceOrder.json?.order?.id;

  const racers = await Promise.all(
    Array.from({ length: 6 }, () =>
      call(`/api/orders/${raceId}/payments`, {
        method: "POST",
        token,
        body: { amountCents: 50_000, paidOn: "2026-08-10" },
      }),
    ),
  );

  const accepted = racers.filter((r) => r.status === 201).length;
  check("exactly one of six simultaneous full payments is accepted",
    accepted === 1, `${accepted} were accepted`);

  const afterRace = await call(`/api/orders/${raceId}`, { token });
  check("order holds exactly one payment",
    afterRace.json?.order?.payments?.length === 1,
    `${afterRace.json?.order?.payments?.length} payments`);
  check("paid never exceeds the total",
    afterRace.json?.order?.paidCents <= afterRace.json?.order?.totalCents);

  /* ---- immutability ---- */
  section("Order locking");

  const edit = await call(`/api/orders/${order.id}`, {
    method: "PATCH",
    token,
    body: {
      customer: "Renamed",
      dueDate: "2026-12-31",
      lineItems: [{ description: "Cheaper", quantity: 1, unitPriceCents: 1 }],
    },
  });
  check("editing a paid order returns 409", edit.status === 409, `got ${edit.status}`);
  check("lock code is ORDER_LOCKED", edit.json?.error?.code === "ORDER_LOCKED");

  const del = await call(`/api/orders/${order.id}`, { method: "DELETE", token });
  check("deleting a paid order returns 409", del.status === 409);

  /* ---- tenant isolation ---- */
  section("Tenant isolation");

  const otherEmail = `smoke-other-${Date.now()}@example.com`;
  const other = await call("/api/auth/signup", {
    method: "POST",
    body: { email: otherEmail, password },
  });
  const otherToken = other.json?.token;

  const peek = await call(`/api/orders/${order.id}`, { token: otherToken });
  check("another user cannot read the order", peek.status === 404, `got ${peek.status}`);
  check("reported as not found rather than forbidden",
    peek.json?.error?.code === "NOT_FOUND");

  const hijack = await call(`/api/orders/${order.id}/payments`, {
    method: "POST",
    token: otherToken,
    body: { amountCents: 100, paidOn: "2026-08-10" },
  });
  check("another user cannot pay against the order", hijack.status === 404);

  const theirList = await call("/api/orders", { token: otherToken });
  check("another user's list is empty", theirList.json?.orders?.length === 0,
    `${theirList.json?.orders?.length} orders visible`);

  /* ---- validation ---- */
  section("Validation");

  const badOrder = await call("/api/orders", {
    method: "POST",
    token,
    body: {
      customer: "",
      dueDate: "not-a-date",
      lineItems: [{ description: "x", quantity: 0, unitPriceCents: -5 }],
    },
  });
  check("invalid order returns 422", badOrder.status === 422);
  check("customer error is attached to the field",
    typeof badOrder.json?.error?.fields?.customer === "string");
  check("due date error is attached to the field",
    typeof badOrder.json?.error?.fields?.dueDate === "string");
  check("nested line errors keep their path",
    Object.keys(badOrder.json?.error?.fields ?? {}).some((k) =>
      k.startsWith("lineItems.0.")),
    JSON.stringify(badOrder.json?.error?.fields));

  const noLines = await call("/api/orders", {
    method: "POST",
    token,
    body: { customer: "Empty", dueDate: "2026-12-31", lineItems: [] },
  });
  check("an order with no lines is rejected", noLines.status === 422);

  const badJson = await fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: "{not json",
  });
  check("malformed JSON returns 400", badJson.status === 400, `got ${badJson.status}`);

  const zeroPayment = await call(`/api/orders/${betaId}/payments`, {
    method: "POST",
    token,
    body: { amountCents: 0, paidOn: "2026-08-10" },
  });
  check("a zero payment is rejected", zeroPayment.status === 422);

  /* ---- filtering and export ---- */
  section("Filtering and export");

  const paidOnly = await call("/api/orders?status=paid", { token });
  check("status filter returns only paid orders",
    paidOnly.json?.orders?.every((o) => o.status === "paid") === true &&
      paidOnly.json?.orders?.length > 0,
    JSON.stringify(paidOnly.json?.orders?.map((o) => o.status)));

  const badFilter = await call("/api/orders?status=nonsense", { token });
  check("an unknown status filter is rejected", badFilter.status === 422);

  const csv = await call("/api/orders/export", { token });
  check("csv export returns 200", csv.status === 200);
  check("csv has the right content type",
    csv.headers.get("content-type")?.includes("text/csv") === true,
    csv.headers.get("content-type"));
  check("csv has a header row",
    csv.text.startsWith("reference,customer,due_date,status"),
    csv.text.slice(0, 60));

  /* ---- summary ---- */
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nSmoke test crashed:", error);
  process.exit(1);
});
