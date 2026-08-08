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
 * Marketing header: a full-width bar that condenses into a floating pill.
 *
 * AT THE TOP it is not a bar at all. No border, no background, nothing between
 * the wordmark and the hero. A rule across the full width of a page announces
 * "application chrome", and a marketing page wants the content to start at the
 * top of the screen.
 *
 * ON SCROLL it collapses: the container narrows to a pill, gains a frosted
 * ground, and the wordmark text slides shut behind the mark. Everything moving
 * is a property that composes on the compositor (max-width, padding, radius,
 * colour, blur), so the whole thing is one transition rather than a layout
 * thrash, and the links never reflow because their own box does not change.
 *
 * The wordmark collapsing is the part that earns it. A pill that keeps the full
 * lockup is just a smaller bar; dropping to the mark alone makes the scrolled
 * state read as an emblem, and it buys back the width the pill gave up.
 *
 * It reveals on the frame after mount rather than rendering immediately,
 * because `scrollY` is only knowable on the client. Without it, anyone landing
 * mid-page (a refresh, a hash link) sees the expanded bar for one frame and
 * then watches it snap shut.
 */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);

    window.addEventListener("scroll", onScroll, { passive: true });

    // Next frame, not synchronously in the effect body: reading and setting in
    // the same tick would render twice before paint for no benefit.
    const frame = requestAnimationFrame(() => {
      onScroll();
      setReady(true);
    });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const condensed = scrolled && !open;

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 flex flex-col items-center px-3",
        "transition-opacity duration-350 ease-out-quint",
        ready ? "opacity-100" : "opacity-0",
      )}
    >
      <div
        className={cn(
          "flex w-full items-center gap-4",
          "border transition-[max-width,margin,padding,border-radius,border-color,background-color,box-shadow] duration-500 ease-drawer",
          condensed
            ? "mt-2.5 max-w-3xl rounded-full border-line bg-surface-canvas/72 px-3 py-1.5 shadow-raised backdrop-blur-xl"
            : // The resting bar shares the page gutter (px-5 / md:px-8) so the
              // mark sits on the same vertical line as the content below it.
              // At px-2 it was jammed against the viewport edge while the
              // button on the right had its own padding holding it off, and the
              // two sides read as different margins.
              "mt-3 max-w-content rounded-none border-transparent bg-transparent px-5 py-3 md:mt-4 md:px-8",
        )}
      >
        <Link
          href="/"
          className="group inline-flex min-h-8 shrink-0 items-center text-ink"
          aria-label="Folio home"
        >
          <Mark className="size-5 shrink-0 transition-transform duration-280 ease-spring group-hover:rotate-90" />
          {/*
            `max-width` and `opacity`, never `display`. A hidden element cannot
            transition, so swapping visibility would make the wordmark pop in
            and out while everything around it glides.
          */}
          <span
            className={cn(
              "overflow-hidden font-heading leading-none whitespace-nowrap",
              "text-[1.5rem] tracking-[-0.028em]",
              "transition-[max-width,opacity,margin] duration-400 ease-drawer",
              condensed ? "ml-0 max-w-0 opacity-0" : "ml-2.5 max-w-40 opacity-100",
            )}
          >
            Folio
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {SECTIONS.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="rounded-full px-3 py-1.5 text-body-sm text-ink-muted transition-colors duration-160 hover:bg-action-ghost-hover hover:text-ink"
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <Link
            href="/login"
            className="hidden rounded-full px-2.5 py-1.5 text-body-sm text-ink-muted transition-colors duration-160 hover:text-ink sm:inline-block"
          >
            Sign in
          </Link>
          <Button asChild size="sm" className="rounded-full px-4">
            <Link href="/login">Open the demo</Link>
          </Button>
          <MenuButton open={open} onToggle={() => setOpen((value) => !value)} />
        </div>
      </div>

      {/*
        Mobile sheet, inside the same floating container so it hangs off the
        pill rather than spanning the viewport. `grid-template-rows` from 0fr to
        1fr animates to the content's real height without anyone having to
        guess a max-height that is wrong for one of the two states.
      */}
      <div
        id="site-menu"
        className={cn(
          "grid w-full max-w-3xl overflow-hidden md:hidden",
          "transition-[grid-template-rows,opacity] duration-350 ease-drawer",
          open ? "mt-1.5 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0">
          <div className="flex flex-col gap-0.5 rounded-2xl border border-line bg-surface-canvas/92 p-2 shadow-overlay backdrop-blur-xl">
            {SECTIONS.map((section) => (
              <a
                key={section.href}
                href={section.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-body text-ink-muted transition-colors duration-160 hover:bg-action-ghost-hover hover:text-ink"
              >
                {section.label}
              </a>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-body text-ink-muted transition-colors duration-160 hover:bg-action-ghost-hover hover:text-ink"
            >
              Sign in
            </Link>
          </div>
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
      className="flex size-8 shrink-0 flex-col items-center justify-center gap-1.5 md:hidden"
    >
      <span
        className={cn(
          "block h-px w-4 rounded-full bg-ink transition-transform duration-280 ease-out-quint",
          open && "translate-y-[3.5px] rotate-45",
        )}
      />
      <span
        className={cn(
          "block h-px w-4 rounded-full bg-ink transition-transform duration-280 ease-out-quint",
          open && "-translate-y-[3.5px] -rotate-45",
        )}
      />
    </button>
  );
}
