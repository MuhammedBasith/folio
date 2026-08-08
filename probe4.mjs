const BASE = "http://localhost:3000";
const email = `p4-${Date.now()}@x.test`;
async function call(path, opts = {}) {
  const res = await fetch(BASE + path, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
  const t = await res.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: res.status, body: b };
}
const s = await call("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password: "password123" }) });
const H = { authorization: `Bearer ${s.body.token}` };

let destroyed = 0, underwater = 0, trials = 0;
for (let i = 0; i < 40; i++) {
  // ---- DELETE vs payment ----
  const o = await call("/api/orders", { method: "POST", headers: H, body: JSON.stringify({
    customer: `Race${i}`, dueDate: "2026-12-01",
    lineItems: [{ description: "x", quantity: 1, unitPriceCents: 50000 }] }) });
  const id = o.body.order.id;
  const [del, pay] = await Promise.all([
    call(`/api/orders/${id}`, { method: "DELETE", headers: H }),
    call(`/api/orders/${id}/payments`, { method: "POST", headers: H, body: JSON.stringify({ amountCents: 50000, paidOn: "2026-08-08" }) }),
  ]);
  trials++;
  if (del.status === 200 && pay.status === 201) {
    const after = await call(`/api/orders/${id}`, { headers: H });
    if (after.status === 404) { destroyed++; if (destroyed === 1) console.log("DESTROYED: delete", del.status, "payment", pay.status, "-> order+payment gone"); }
  }

  // ---- PATCH vs payment ----
  const o2 = await call("/api/orders", { method: "POST", headers: H, body: JSON.stringify({
    customer: `Race2-${i}`, dueDate: "2026-12-01",
    lineItems: [{ description: "x", quantity: 1, unitPriceCents: 100000 }] }) });
  const id2 = o2.body.order.id;
  const [patch, pay2] = await Promise.all([
    call(`/api/orders/${id2}`, { method: "PATCH", headers: H, body: JSON.stringify({
      customer: `Race2-${i}`, dueDate: "2026-12-01",
      lineItems: [{ description: "cheap", quantity: 1, unitPriceCents: 100 }] }) }),
    call(`/api/orders/${id2}/payments`, { method: "POST", headers: H, body: JSON.stringify({ amountCents: 100000, paidOn: "2026-08-08" }) }),
  ]);
  if (patch.status === 200 && pay2.status === 201) {
    const after = await call(`/api/orders/${id2}`, { headers: H });
    if (after.status === 200 && after.body.order.paidCents > after.body.order.totalCents) {
      underwater++;
      if (underwater === 1) console.log("UNDERWATER: total", after.body.order.totalCents, "paid", after.body.order.paidCents, "status", after.body.order.status, "editable", after.body.order.editable, "id", id2);
    }
  }
}
console.log(`trials=${trials} payments_destroyed_by_delete=${destroyed} orders_underwater_by_patch=${underwater}`);
