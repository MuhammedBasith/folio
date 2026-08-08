/**
 * Responsiveness audit.
 *
 * Screenshots prove a page looks right at the two widths they were taken at.
 * This proves a stronger thing at many widths: that nothing overflows its
 * viewport horizontally, no interactive target is smaller than a fingertip, and
 * no text is rendered at a size that makes iOS zoom the page on focus.
 *
 *   bun run responsive
 *
 * The widths are the real cliff edges, not round numbers: 320 is the narrowest
 * phone still in use, 360 and 390 are the two commonest, 414 is a large phone,
 * 768 and 834 are tablet portrait, and the rest are laptop and desktop. Each
 * one is checked in both themes, because a theme can change a border and a
 * border can change a width.
 */
import { chromium } from "playwright";

const BASE = process.env.RESPONSIVE_BASE ?? "http://localhost:3000";

const WIDTHS = [320, 360, 390, 414, 768, 834, 1024, 1280, 1440, 1920];

const PAGES = [
  { name: "landing", path: "/", auth: false },
  { name: "login", path: "/login", auth: false },
  { name: "signup", path: "/signup", auth: false },
  { name: "tokens", path: "/tokens", auth: false },
  { name: "orders", path: "/orders", auth: true },
  { name: "order-new", path: "/orders/new", auth: true },
  { name: "order-detail", path: "__FIRST_ORDER__", auth: true },
];

/**
 * 44px is Apple's minimum and 24px is the WCAG 2.2 AA floor. The check uses 24,
 * because holding every control to 44 would make a dense financial table
 * impossible and the standard explicitly allows smaller targets with adequate
 * spacing. Anything under 24 is a genuine defect.
 */
const MIN_TARGET = 24;

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "demo@folio.app");
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/orders", { timeout: 20000 });
}

async function audit(page) {
  return page.evaluate((minTarget) => {
    const problems = [];
    const docWidth = document.documentElement.clientWidth;

    // 1. Horizontal overflow. `scrollWidth` on the root catches anything that
    //    pushes the page wider than the viewport, which is the single most
    //    common responsive defect and the one users notice immediately.
    if (document.documentElement.scrollWidth > docWidth + 1) {
      const culprits = [...document.querySelectorAll("body *")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > docWidth + 1;
        })
        // Report the outermost offenders; their children are consequences.
        .filter((el) => !el.parentElement?.closest("[data-overflow-flagged]"))
        .slice(0, 3)
        .map((el) => {
          el.setAttribute("data-overflow-flagged", "");
          const r = el.getBoundingClientRect();
          return `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")} right=${Math.round(r.right)}`;
        });

      problems.push(
        `overflows by ${document.documentElement.scrollWidth - docWidth}px: ${culprits.join(" | ")}`,
      );
    }

    // 2. Touch targets.
    //
    // The measured box is not always the element's own. A stretched anchor
    // (`::after { position: absolute; inset: 0 }`) is a small link whose real
    // hit area is its nearest positioned ancestor, which is how every row in
    // the orders table is clickable. Measuring the anchor would report a 64x15
    // target that is actually the full width of a table row.
    const effectiveRect = (el) => {
      const after = getComputedStyle(el, "::after");
      const stretched =
        after.position === "absolute" &&
        after.content !== "none" &&
        ["top", "right", "bottom", "left"].every(
          (side) => after[side] === "0px" || after[side] === "auto",
        ) &&
        after.top === "0px" &&
        after.bottom === "0px";

      if (!stretched) return el.getBoundingClientRect();

      const host = el.offsetParent ?? el.parentElement;
      return (host ?? el).getBoundingClientRect();
    };

    const interactive = [
      ...document.querySelectorAll(
        "a[href], button, input, select, textarea, [role=button]",
      ),
    ];

    /**
     * WCAG 2.5.8 exempts a target that is "in a sentence or block of text".
     *
     * That exception is not a loophole, it is the only workable rule: padding a
     * link that sits mid-sentence pushes the words around it out of line, and
     * the reader has the whole sentence as context for where to tap. So an
     * inline anchor with text beside it inside the same paragraph is skipped,
     * and a link sitting alone in a list or a nav is not.
     */
    const inlineInText = (el) => {
      if (getComputedStyle(el).display !== "inline") return false;

      const parent = el.parentElement;
      if (!parent) return false;

      return [...parent.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
      );
    };

    for (const el of interactive) {
      const rect = effectiveRect(el);
      if (rect.width === 0 || rect.height === 0) continue; // hidden

      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      if (inlineInText(el)) continue;

      if (rect.height < minTarget || rect.width < minTarget) {
        const label =
          el.getAttribute("aria-label") ??
          el.textContent?.trim().slice(0, 24) ??
          el.tagName;
        problems.push(
          `target ${Math.round(rect.width)}x${Math.round(rect.height)} "${label}"`,
        );
      }
    }

    // 3. Font size on focusable inputs. Below 16px, iOS Safari zooms the
    //    viewport on focus and never zooms back out.
    if (window.innerWidth < 640) {
      for (const el of document.querySelectorAll("input, textarea, select")) {
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < 16) {
          problems.push(
            `input font-size ${size}px (iOS will zoom) on ${el.id || el.name || el.type}`,
          );
        }
      }
    }

    return problems;
  }, MIN_TARGET);
}

async function main() {
  const browser = await chromium.launch();
  const problems = [];
  let checks = 0;

  for (const theme of ["light", "dark"]) {
    /**
     * TWO CONTEXTS, SIGNED OUT AND SIGNED IN.
     *
     * The landing page redirects an authenticated visitor straight to /orders,
     * so auditing it from a signed-in session silently audits the dashboard
     * twice and never looks at the landing page at all. That is exactly the
     * kind of quiet false pass a check like this exists to avoid.
     */
    async function makeContext() {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        colorScheme: theme,
      });
      await context.addInitScript(
        ([key, value]) => localStorage.setItem(key, value),
        ["folio-theme", theme],
      );
      return context;
    }

    const anon = await makeContext();
    const anonPage = await anon.newPage();

    const authed = await makeContext();
    const authedPage = await authed.newPage();
    await signIn(authedPage);

    // Resolve one real order id, so the detail page is audited too.
    await authedPage.goto(`${BASE}/orders`, { waitUntil: "networkidle" });
    const detailPath = await authedPage.evaluate(() => {
      const link = document.querySelector(
        'a[href^="/orders/"]:not([href$="/new"])',
      );
      return link ? new URL(link.href).pathname : null;
    });

    for (const target of PAGES) {
      const path =
        target.path === "__FIRST_ORDER__" ? detailPath : target.path;
      if (!path) continue;

      const page = target.auth ? authedPage : anonPage;

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
        // Let the entrance animations settle; a mid-transform element has a
        // different box and would report false overflow.
        await page.waitForTimeout(450);

        checks += 1;
        const found = await audit(page);

        for (const problem of found) {
          problems.push(`[${theme} ${width}px ${target.name}] ${problem}`);
        }
      }
    }

    await anon.close();
    await authed.close();
  }

  await browser.close();

  // The same target failing at ten widths is one defect, not ten.
  const distinct = new Map();
  for (const problem of problems) {
    // Strip the width so one defect seen at ten widths is reported once, with
    // the widths it was seen at.
    const match = /^\[(\w+) (\d+)px (.+?)\] (.+)$/.exec(problem);
    if (!match) continue;
    const [, , width, page, detail] = match;
    const key = `${page} :: ${detail}`;
    if (!distinct.has(key)) distinct.set(key, new Set());
    distinct.get(key).add(width);
  }

  console.log(`${checks} page/width combinations audited`);

  if (distinct.size > 0) {
    console.error(`\n${distinct.size} distinct problem(s):`);
    for (const [key, widths] of distinct) {
      console.error(`  ${key}  @ ${[...widths].join(", ")}px`);
    }
    process.exit(1);
  }

  console.log("no overflow, no undersized targets, no zoom-triggering inputs");
}

await main();
