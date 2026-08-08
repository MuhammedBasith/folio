"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Mark } from "@/components/brand/mark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { api } from "@/lib/api-client";

/**
 * Application header.
 *
 * NO NAVIGATION TABS. The product has one section. A tab bar with a single tab
 * is furniture: it costs vertical space, adds a horizontal rule of visual
 * noise, and implies somewhere else to go that does not exist. The wordmark is
 * the way home, which every user already knows.
 *
 * THE ACCOUNT CONTROL DOES NOT SQUASH. It used to carry `pressable`, so opening
 * the menu scaled the trigger to 98% and the header appeared to flinch. Press
 * feedback belongs on things that commit an action; a menu trigger reveals
 * something, and what it reveals is the feedback. The chevron rotating stands in
 * for the acknowledgement, and it also tells you the menu is open.
 *
 * The other half of that jump was the scrollbar disappearing under Radix's
 * scroll lock, which is fixed globally with `scrollbar-gutter` in `base.css`.
 */
export function AppHeader({ email }: { email: string }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  /**
   * A failed sign-out must not look like a successful one. With only a
   * `finally`, a network failure left the session cookie intact and gave no
   * indication anything had gone wrong, which on a shared machine is the
   * difference between believing you signed out and having done so.
   */
  async function handleSignOut() {
    setSigningOut(true);
    setSignOutFailed(false);

    try {
      await api.logout();
      router.replace("/login");
      router.refresh();
    } catch {
      setSignOutFailed(true);
      setSigningOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/78 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-content items-center gap-4 px-5 md:px-8">
        <Link
          href="/orders"
          className="group inline-flex items-center gap-2.5 text-ink"
          aria-label="Folio home"
        >
          <Mark className="size-4 transition-transform duration-280 ease-spring group-hover:rotate-90" />
          <span className="font-heading text-[1.125rem] leading-none tracking-[-0.022em]">
            Folio
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-1">
          {signOutFailed ? (
            <span
              role="alert"
              className="mr-1.5 text-caption text-feedback-error-ink"
            >
              Sign out failed
            </span>
          ) : null}

          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="group inline-flex h-8 items-center gap-2 rounded-full py-1 pr-2 pl-1 text-caption text-ink-muted transition-colors duration-160 ease-out-quint hover:bg-action-ghost-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
              >
                <span
                  aria-hidden
                  className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-inverse text-[0.625rem] font-medium text-ink-inverse"
                >
                  {email.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-40 truncate sm:inline">
                  {email}
                </span>
                <ChevronDown
                  aria-hidden
                  className="size-3 opacity-45 transition-transform duration-200 ease-out-quint group-data-[state=open]:rotate-180"
                />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-60">
              <div className="px-2 py-1.5">
                <p className="text-caption text-ink-faint">Signed in as</p>
                <p className="mt-0.5 truncate text-body-sm text-ink">{email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={handleSignOut}
                disabled={signingOut}
                className="text-body-sm"
              >
                <SignOutIcon />
                {signingOut ? "Signing out" : "Sign out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

/**
 * Sign out.
 *
 * Drawn rather than imported, because the icon set's version is a door with an
 * arrow bursting out of it: three shapes, two weights and a lot of literal
 * storytelling for a menu row that is already labelled "Sign out". This is an
 * open bracket and an arrow leaving it, at the same 1.5 stroke as everything
 * else, with the arrowhead as a single mitred corner rather than two strokes.
 *
 * The bracket is deliberately open on the right so the arrow reads as passing
 * through a gap rather than colliding with a wall.
 */
function SignOutIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
    >
      <path d="M14.5 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8" />
      <path d="M17.5 8.5 21 12l-3.5 3.5" />
      <path d="M21 12h-9" />
    </svg>
  );
}
