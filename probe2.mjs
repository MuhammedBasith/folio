const BASE = "http://localhost:3000";
const TOKEN = process.env.TOK;
const H = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

// confirm poisoned row persisted
const { PrismaClient } = await import("./src/generated/prisma/client.js").catch(() => ({}));
// page render with cookie
const page = await fetch(`${BASE}/orders`, { headers: { cookie: `ledger_session=${TOKEN}` }, redirect: "manual" });
console.log("[A] GET /orders with session cookie ->", page.status);
const html = await page.text();
console.log("    contains 'Something went wrong':", html.includes("Something went wrong"));

// detail page for a nonexistent order
const detail = await fetch(`${BASE}/orders/does-not-exist-id`, { headers: { cookie: `ledger_session=${TOKEN}` }, redirect: "manual" });
const dHtml = await detail.text();
console.log("[B] GET /orders/does-not-exist-id ->", detail.status,
  "| 404 page:", dHtml.includes("Nothing here"),
  "| error page:", dHtml.includes("Something went wrong"));
