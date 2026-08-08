"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/**
 * Application header.
 *
 * The active link is marked with a 1px ink underline rather than a filled pill,
 * taken from the reference dashboards: the underline sits in the text's own
 * baseline rhythm and adds no visual weight to a bar that is meant to recede.
 *
 * No transition on the active marker. Navigation is a page change, and animating
 * a marker that only ever moves when the page under it has already replaced
 * itself reads as lag, not polish.
 */
export function AppHeader({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await api.logout();
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const links = [{ href: "/orders", label: "Orders" }];

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-content items-center gap-6 px-5 md:px-8">
        <Link
          href="/orders"
          className="font-heading text-[1.375rem] leading-none tracking-[-0.02em] text-ink"
        >
          Ledger
        </Link>

        <nav className="flex items-center gap-1" aria-label="Main">
          {links.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative rounded-sm px-2 py-1 text-body-sm",
                  active ? "text-ink" : "text-ink-muted hover:text-ink",
                )}
              >
                {link.label}
                {active ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-2 -bottom-[21px] h-px bg-line-strong"
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-caption text-ink-faint sm:inline">
            {email}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? "Signing out" : "Sign out"}
          </Button>
        </div>
      </div>
    </header>
  );
}
