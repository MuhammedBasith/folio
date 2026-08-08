const BASE = "http://localhost:3000";
const email = `probe-${Date.now()}@x.test`;

async function call(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "content-type": "application/json", ...(opts.headers || {}) },
  });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
  return { status: res.status, body };
}

const signup = await call("/api/auth/signup", {
  method: "POST",
  body: JSON.stringify({ email, password: "password123" }),
});
console.log("signup:", signup.status);
const token = signup.body.token;
const H = { authorization: `Bearer ${token}` };

// --- 1. year-0000 due date ------------------------------------------------
const zeroDate = await call("/api/orders", {
  method: "POST", headers: H,
  body: JSON.stringify({
    customer: "Zero Date", dueDate: "0000-01-01",
    lineItems: [{ description: "x", quantity: 1, unitPriceCents: 100 }],
  }),
});
console.log("\n[1] dueDate=0000-01-01 ->", zeroDate.status, JSON.stringify(zeroDate.body));

// --- 2. paidOn year 0000 on a payment ------------------------------------
const good = await call("/api/orders", {
  method: "POST", headers: H,
  body: JSON.stringify({
    customer: "Normal", dueDate: "2026-12-01",
    lineItems: [{ description: "x", quantity: 1, unitPriceCents: 100000 }],
  }),
});
console.log("[2a] normal order ->", good.status, good.body.order?.id);
const pay = await call(`/api/orders/${good.body.order.id}/payments`, {
  method: "POST", headers: H,
  body: JSON.stringify({ amountCents: 1, paidOn: "0000-06-15" }),
});
console.log("[2b] paidOn=0000-06-15 ->", pay.status, JSON.stringify(pay.body).slice(0, 300));

// --- 3. integer overflow via 91 max line items ---------------------------
const lines = Array.from({ length: 91 }, (_, i) => ({
  description: `L${i}`, quantity: 100000, unitPriceCents: 999999999,
}));
const big = await call("/api/orders", {
  method: "POST", headers: H,
  body: JSON.stringify({ customer: "Overflow", dueDate: "2026-12-01", lineItems: lines }),
});
console.log("\n[3a] 91 max lines ->", big.status, JSON.stringify(big.body).slice(0, 300));

const list = await call("/api/orders", { headers: H });
console.log("[3b] GET /api/orders afterwards ->", list.status, JSON.stringify(list.body).slice(0, 200));

const csv = await fetch(BASE + "/api/orders/export", { headers: H });
console.log("[3c] GET /api/orders/export ->", csv.status);

const page = await fetch(BASE + "/orders", { headers: { cookie: "" } });
console.log("[3d] GET /orders (page, no cookie) ->", page.status);

console.log("\nTOKEN:", token);
console.log("EMAIL:", email);
