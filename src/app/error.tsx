"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Error boundary.
 *
 * Shows the user nothing about what actually broke. `error.message` from a
 * server component is already redacted in production, but relying on that
 * rather than deciding it here would be leaving it to the framework.
 *
 * `error.digest` IS shown: it is a hash Next writes to the server logs
 * alongside the real stack, so quoting it turns a bug report into something
 * traceable in one grep.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Stands in for the error tracker this would report to in production.
    console.error("[app] render error", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-16">
      <div className="max-w-prose text-center">
        <p className="font-mono text-caption text-ink-faint">Error</p>
        <h1 className="mt-4 font-heading text-display-lg text-ink">
          Something went wrong
        </h1>
        <p className="mt-3 text-body text-ink-muted">
          This is on our side, not yours. Nothing you were looking at has been
          changed.
        </p>

        {error.digest ? (
          <p className="mt-4 font-mono text-caption text-ink-faint">
            Reference: {error.digest}
          </p>
        ) : null}

        <div className="mt-8 flex justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="secondary">
            <Link href="/orders">Back to your orders</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
