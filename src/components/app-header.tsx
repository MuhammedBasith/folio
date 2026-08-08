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
import { api } from "@/lib/api-client";

/**
 * Application header.
 *
 * NO NAVIGATION TABS. The product has one section. A tab bar with a single tab
 * is furniture: it costs vertical space, adds a horizontal rule of visual
 * noise, and implies somewhere else to go that does not exist. The wordmark is
 * the way home, which every user already knows.
 *
 * The account collapses into one control rather than sitting as a loose email
 * beside a loose button. Two adjacent things the eye has to parse become one.
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
    <header className="sticky top-0 z-30 border-b border-line bg-surface/80 backdrop-blur-md">
      <div className="mx-auto flex h-13 w-full max-w-content items-center gap-4 px-5 md:px-8">
        <Link
          href="/orders"
          className="font-heading text-[1.0625rem] leading-none tracking-[-0.02em] text-ink transition-opacity duration-160 hover:opacity-60"
        >
          Tally
        </Link>

        <div className="ml-auto flex items-center gap-3">
          {signOutFailed ? (
            <span role="alert" className="text-caption text-feedback-error-ink">
              Sign out failed
            </span>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="pressable inline-flex items-center gap-2 rounded-md py-1 pr-1.5 pl-1 text-caption text-ink-muted transition-colors duration-160 ease-out-quint hover:bg-action-ghost-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-ring)"
              >
                <span
                  aria-hidden
                  className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-inverse text-[0.625rem] font-medium text-ink-inverse"
                >
                  {email.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-44 truncate sm:inline">
                  {email}
                </span>
                <ChevronDown aria-hidden className="size-3 opacity-50" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-label uppercase text-ink-faint">
                  Signed in as
                </p>
                <p className="mt-1 truncate text-caption text-ink">{email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={handleSignOut}
                disabled={signingOut}
                className="text-caption"
              >
                {signingOut ? "Signing out" : "Sign out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
