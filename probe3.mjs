const BASE = "http://localhost:3000";
const email = `p3-${Date.now()}@x.test`;
async function call(path, opts = {}) {
  const res = await fetch(BASE + path, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, raw: text };
}
const s = await call("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password: "password123" }) });
const H = { authorization: `Bearer ${s.body.token}` };

// notes too long -> which field key?
const longNotes = await call("/api/orders", { method: "POST", headers: H, body: JSON.stringify({
  customer: "N", dueDate: "2026-12-01", notes: "z".repeat(1001),
  lineItems: [{ description: "x", quantity: 1, unitPriceCents: 100 }] }) });
console.log("[notes>1000]", longNotes.status, JSON.stringify(longNotes.body));

// unitPriceCents rejected -> field key
const badPrice = await call("/api/orders", { method: "POST", headers: H, body: JSON.stringify({
  customer: "N", dueDate: "2026-12-01",
  lineItems: [{ description: "x", quantity: 1, unitPriceCents: 1000000000 }] }) });
console.log("[unitPriceCents too big]", badPrice.status, JSON.stringify(badPrice.body));

// CSV escaping test
const csvOrder = await call("/api/orders", { method: "POST", headers: H, body: JSON.stringify({
  customer: '=cmd|\' /C calc\'!A0, "quoted", \nnewline', dueDate: "2026-12-01",
  lineItems: [{ description: "x", quantity: 1, unitPriceCents: 12345 }] }) });
console.log("[csv order]", csvOrder.status, JSON.stringify(csvOrder.body).slice(0,150));

const csv = await fetch(BASE + "/api/orders/export", { headers: H });
console.log("[csv]", csv.status);
console.log(JSON.stringify(await csv.text()));

// from/to garbage
const csv2 = await fetch(BASE + "/api/orders/export?from=01/01/2026&to=notadate", { headers: H });
console.log("[csv garbage range]", csv2.status, JSON.stringify((await csv2.text()).slice(0,200)));

// route collision check: an order literally reachable at /api/orders/export?
const oid = csvOrder.body.order?.id;
const got = await call(`/api/orders/${oid}`, { headers: H });
console.log("[get by id]", got.status);

// method not allowed
const bad = await call("/api/orders/export", { method: "POST", headers: H, body: "{}" });
console.log("[POST to export]", bad.status, JSON.stringify(bad.body).slice(0,150));

// unknown field stripped / totalCents injection
const inj = await call("/api/orders", { method: "POST", headers: H, body: JSON.stringify({
  customer: "Inj", dueDate: "2026-12-01", totalCents: 1, id: "hacked", ownerId: "someone",
  lineItems: [{ description: "x", quantity: 1, unitPriceCents: 500 }] }) });
console.log("[extra fields]", inj.status, inj.body.order?.id, inj.body.order?.totalCents);

// non-json body
const nj = await fetch(BASE + "/api/orders", { method: "POST", headers: { ...H, "content-type": "application/json" }, body: "not json" });
console.log("[bad json]", nj.status, (await nj.text()).slice(0,150));

// array body
const arr = await call("/api/orders", { method: "POST", headers: H, body: "[]" });
console.log("[array body]", arr.status, JSON.stringify(arr.body).slice(0,200));

// dueDate huge year rejected by regex?
for (const d of ["2026-2-01", "2026-13-01", "0001-01-01", "10000-01-01"]) {
  const r = await call("/api/orders", { method: "POST", headers: H, body: JSON.stringify({
    customer: "D", dueDate: d, lineItems: [{ description: "x", quantity: 1, unitPriceCents: 1 }] }) });
  console.log(`[dueDate ${d}]`, r.status, JSON.stringify(r.body).slice(0,140));
}
console.log("TOKEN3:", s.body.token);
