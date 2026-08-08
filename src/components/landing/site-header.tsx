"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mark } from "@/components/brand/mark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "The hard part", href: "#the-rule" },
  { label: "To the cent", href: "#exact" },
];

/**
 * Marketing header.
 *
 * WHAT IT IS NOT: a bordered bar pinned to the top of the page with tabs in it.
 * That was the previous version and it read as chrome from 1999. A rule across
 * the full width of a page announces "application"; a marketing page wants the
 * content to start at the top of the screen.
 *
 * So: no border and a transparent ground at rest, and the bar only materialises
 * once the page has scrolled under it, when it genuinely needs to separate
 * itself from what is passing beneath. The transition is on background, border
 * and blur only, which are all cheap.
 *
 * The wordmark is deliberately larger than the one inside the product. Here it
 * is the brand; there it is a way home.
 */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-scrolled={scrolled || undefined}
      className={cn(
        "sticky top-0 z-40 border-b border-transparent",
        "transition-[background-color,border-color,backdrop-filter] duration-280 ease-out-quint",
        "data-scrolled:border-line data-scrolled:bg-surface-canvas/78 data-scrolled:backdrop-blur-xl",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-content items-center gap-6 px-5 md:px-8">
        <Link
          href="/"
          className="group inline-flex items-center gap-2.5 text-ink"
          aria-label="Folio home"
        >
          <Mark className="size-5 transition-transform duration-280 ease-spring group-hover:rotate-90" />
          <span className="font-heading text-[1.5rem] leading-none tracking-[-0.028em]">
            Folio
          </span>
        </Link>

        <nav className="ml-4 hidden items-center gap-7 md:flex">
          {SECTIONS.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="text-body-sm text-ink-muted transition-colors duration-160 hover:text-ink"
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
          <ThemeToggle />
          <Link
            href="/login"
            className="hidden text-body-sm text-ink-muted transition-colors duration-160 hover:text-ink sm:inline"
          >
            Sign in
          </Link>
          <Button asChild size="sm" className="rounded-lg px-3.5">
            <Link href="/login">Open the demo</Link>
          </Button>
          <MenuButton open={open} onToggle={() => setOpen((value) => !value)} />
        </div>
      </div>

      {/*
        Mobile sheet. Animating max-height rather than height because the
        content has no fixed size, and animating opacity alongside so the links
        do not appear before there is room for them.
      */}
      <div
        id="site-menu"
        className={cn(
          "overflow-hidden md:hidden",
          "transition-[max-height,opacity] duration-280 ease-drawer",
          open ? "max-h-64 opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="flex flex-col gap-0.5 border-t border-line bg-surface-canvas/92 px-5 py-3 backdrop-blur-xl">
          {SECTIONS.map((section) => (
            <a
              key={section.href}
              href={section.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-2.5 text-body text-ink-muted transition-colors duration-160 hover:bg-action-ghost-hover hover:text-ink"
            >
              {section.label}
            </a>
          ))}
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="rounded-md px-2 py-2.5 text-body text-ink-muted transition-colors duration-160 hover:bg-action-ghost-hover hover:text-ink"
          >
            Sign in
          </Link>
        </div>
      </div>
    </header>
  );
}

/**
 * Two bars that become an X.
 *
 * Both are the same width when open, and the lower one is shorter when closed,
 * which reads as a menu without needing a third bar. Transform only, so nothing
 * around it can move.
 */
function MenuButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? "Close menu" : "Open menu"}
      aria-expanded={open}
      aria-controls="site-menu"
      className="-mr-1 flex size-8 shrink-0 flex-col items-end justify-center gap-1.5 md:hidden"
    >
      <span
        className={cn(
          "block h-px w-4.5 rounded-full bg-ink transition-transform duration-280 ease-out-quint",
          open && "translate-y-[3.5px] rotate-45",
        )}
      />
      <span
        className={cn(
          "block h-px rounded-full bg-ink transition-[transform,width] duration-280 ease-out-quint",
          open ? "w-4.5 -translate-y-[3.5px] -rotate-45" : "w-3",
        )}
      />
    </button>
  );
}
