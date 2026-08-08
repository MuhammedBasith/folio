import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GradientPlate } from "@/components/landing/gradient-plate";
import { Mark } from "@/components/brand/mark";
import { Reveal } from "@/components/reveal";

/**
 * Closing statement and footer, on one continuous plate of light.
 *
 * They are a single component because visually they are one thing: the gradient
 * starts behind the last sentence on the page and carries all the way down
 * through the links to the legal line. Splitting them would mean two elements
 * each masking half a gradient and trying to meet in the middle, which never
 * quite lines up.
 *
 * The oversized wordmark at the bottom is cropped by its own container and
 * masked to nothing before the baseline, so only the upper half of the letters
 * is ever visible. A full one would read as a logo someone forgot to scale; a
 * half one reads as the page running out.
 */

const COLUMNS = [
  {
    heading: "The product",
    links: [
      { label: "How it works", href: "#how-it-works" },
      { label: "The status rule", href: "#the-rule" },
      { label: "Exact arithmetic", href: "#exact" },
    ],
  },
  {
    heading: "Get started",
    links: [
      { label: "Open the demo", href: "/login" },
      { label: "Create an account", href: "/signup" },
      { label: "Sign in", href: "/login" },
    ],
  },
  {
    heading: "Reference",
    links: [{ label: "Design tokens", href: "/tokens" }],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-line">
      <GradientPlate
        src="/gradients/signal.webp"
        className="top-[-10%] left-1/2 h-184 w-[min(96rem,190%)] -translate-x-1/2"
        blur="blur-[80px]"
        opacity="opacity-65 dark:opacity-28"
      />

      <div className="relative">
        {/* ---- Closing statement ---- */}
        <div className="mx-auto w-full max-w-content px-5 py-24 text-center md:px-8 md:py-32">
          <Reveal>
            <h2 className="mx-auto max-w-[16ch] font-heading text-display-hero text-balance text-ink">
              Stop guessing who has paid.
            </h2>
            <div className="mt-8 flex justify-center">
              <Button asChild size="lg" className="rounded-lg px-6">
                <Link href="/login">Open the demo</Link>
              </Button>
            </div>
          </Reveal>
        </div>

        {/* ---- Links ---- */}
        <div className="mx-auto w-full max-w-content px-5 pb-12 md:px-8">
          <div className="grid gap-10 border-t border-line pt-12 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
            <div>
              <Link
                href="/"
                className="inline-flex items-center gap-2.5 text-ink transition-opacity duration-160 hover:opacity-65"
              >
                <Mark className="size-4" />
                <span className="font-heading text-[1.25rem] leading-none tracking-[-0.026em]">
                  Folio
                </span>
              </Link>
              <p className="mt-3 max-w-[30ch] text-body-sm text-ink-muted">
                A private ledger for what customers owe you. Your customers never
                see it and never need an account.
              </p>
            </div>

            {COLUMNS.map((column) => (
              <div key={column.heading}>
                <p className="text-caption font-medium text-ink">
                  {column.heading}
                </p>
                <ul className="mt-3.5 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <FooterLink href={link.href}>{link.label}</FooterLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col gap-1.5 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-caption text-ink-faint">
              Folio <span className="tabular-nums">© 2026</span>
            </p>
            <p className="text-caption text-ink-faint">
              Built for people who invoice and then have to chase.
            </p>
          </div>
        </div>

        {/*
          ---- The wordmark, half sunk ----

          THE MASK IS ON THE STRIP, NOT ON THE TEXT. Masking the paragraph puts
          the fade at a percentage of the glyph box, and since only the top
          third of that box is ever inside the container, the fade happened
          entirely below the crop and the letters ended in a hard horizontal
          cut. Masking the visible strip instead means the gradient is measured
          against exactly the region the reader can see, at any viewport.
        */}
        <div
          aria-hidden
          className="relative overflow-hidden select-none"
          style={{
            height: "min(7vw, 92px)",
            maskImage: "linear-gradient(to bottom, black 0%, transparent 92%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, black 0%, transparent 92%)",
          }}
        >
          <p
            className="absolute bottom-0 left-1/2 font-heading whitespace-nowrap text-ink"
            style={{
              fontSize: "min(20vw, 260px)",
              lineHeight: 1,
              letterSpacing: "-0.03em",
              paddingRight: "0.06em",
              transform: "translate(-50%, 34%)",
              opacity: 0.1,
            }}
          >
            Folio
          </p>
        </div>
      </div>
    </footer>
  );
}

/**
 * In-page anchors stay as plain `<a>` and route changes go through `<Link>`.
 * Routing a hash through the client router scrolls the page to the top first on
 * some Next versions, which is the opposite of what an anchor is for.
 */
function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const className =
    "text-body-sm text-ink-muted transition-colors duration-160 hover:text-ink";

  if (href.startsWith("#")) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
