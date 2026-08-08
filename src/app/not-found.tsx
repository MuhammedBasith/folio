import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 404.
 *
 * Deliberately says nothing about whether the thing exists but belongs to
 * somebody else. That distinction is exactly what an attacker would probe for,
 * and the API takes the same position.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-16">
      <div className="max-w-prose text-center">
        <p className="font-mono text-label uppercase text-ink-faint">404</p>
        <h1 className="mt-4 font-heading text-display-lg text-ink">
          Nothing here
        </h1>
        <p className="mt-3 text-body text-ink-muted">
          That page does not exist, or it belongs to a different account.
        </p>
        <div className="mt-8 flex justify-center">
          <Button asChild>
            <Link href="/orders">Back to your orders</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
