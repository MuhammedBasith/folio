/**
 * Screenshots every page in both themes, at desktop and phone widths.
 *
 * This exists because the tests cannot see. A class-merging bug once rendered
 * the primary button as black text on a black background, and every unit test,
 * the typechecker and the linter all passed straight through it. The only thing
 * that catches that class of fault is looking at the pixels.
 *
 *   bun run shoot            everything
 *   bun run shoot orders     just the routes matching "orders"
 *
 * Console errors are collected per page and reported at the end, so a page that
 * renders but throws is not quietly recorded as fine.
 */
import { chromium } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.SHOOT_BASE ?? "http://localhost:3000";
const OUT = path.resolve(
  import.meta.dirname,
  "..",
  ".screenshots",
);

const PAGES = [
  { name: "landing", path: "/", auth: false, full: true },
  { name: "login", path: "/login", auth: false },
  { name: "signup", path: "/signup", auth: false },
  { name: "tokens", path: "/tokens", auth: false, full: true },
  { name: "orders", path: "/orders", auth: true },
  { name: "orders-overdue", path: "/orders?status=overdue", auth: true },
  { name: "order-new", path: "/orders/new", auth: true },
  { name: "settings", path: "/settings", auth: true, full: true },
  { name: "not-found", path: "/nope", auth: false },
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
];

const filter = process.argv[2];

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "demo@folio.app");
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/orders", { timeout: 15000 });
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const problems = [];

  for (const theme of ["light", "dark"]) {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 2,
        colorScheme: theme,
        // Reduced motion off: the entrance animations are part of what is
        // being reviewed, and a screenshot of a page mid-fade is useless.
        reducedMotion: "no-preference",
      });

      const page = await context.newPage();

      // Which page is being shot right now, so a console error can be
      // attributed rather than reported as coming from "somewhere".
      let current = { name: "startup", expect: 200 };

      page.on("console", (message) => {
        if (message.type() !== "error") return;

        // Chromium logs a console error for any non-2xx document, so the 404
        // route reports one every single time. That is the page working.
        const expected404 =
          current.expect === 404 && /status of 404/.test(message.text());

        if (expected404) return;

        problems.push(
          `[${theme}/${viewport.name}] ${current.name}: ${message.text()}`,
        );
      });

      // The pre-paint script reads localStorage, so the preference has to be
      // there before the first navigation rather than set afterwards.
      await context.addInitScript(
        ([key, value]) => localStorage.setItem(key, value),
        ["folio-theme", theme],
      );

      let signedIn = false;

      for (const target of PAGES) {
        if (filter && !target.name.includes(filter)) continue;

        if (target.auth && !signedIn) {
          await signIn(page);
          signedIn = true;
        }

        const expected = target.name === "not-found" ? 404 : 200;
        current = { name: target.name, expect: expected };

        const response = await page.goto(`${BASE}${target.path}`, {
          waitUntil: "networkidle",
        });

        const status = response?.status() ?? 0;
        if (status !== expected) {
          problems.push(
            `[${theme}/${viewport.name}] ${target.path} -> ${status}, expected ${expected}`,
          );
        }

        // Let the reveal animations settle, and scroll the full page so
        // anything waiting on an IntersectionObserver has actually fired.
        if (target.full) {
          await page.evaluate(async () => {
            const step = window.innerHeight * 0.8;
            for (let y = 0; y < document.body.scrollHeight; y += step) {
              window.scrollTo(0, y);
              await new Promise((resolve) => setTimeout(resolve, 90));
            }
            window.scrollTo(0, 0);
          });
        }

        await page.waitForTimeout(700);

        await page.screenshot({
          path: path.join(
            OUT,
            `${target.name}-${viewport.name}-${theme}.png`,
          ),
          fullPage: Boolean(target.full),
        });
      }

      await context.close();
    }
  }

  await browser.close();

  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  console.log(`screenshots written to ${path.relative(process.cwd(), OUT)}`);
}

await main();
