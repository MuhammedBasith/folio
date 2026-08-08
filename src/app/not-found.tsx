import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 404.
 *
 * Deliberately says nothing about whether the thing exists but belongs to
 * somebody else. That distinction is exactly what an attacker would probe for,
 * and the API takes the same position.
 *
 * IT SETTLES IN RATHER THAN LANDING. Every other entrance in this codebase
 * animates, so a page that slams in fully formed does not read as restraint, it
 * reads as the one screen nobody finished. This is also the page somebody
 * arrives at by accident, and four lines assembling in order gives the eye
 * somewhere to start instead of presenting a wall of apology at once.
 *
 * `rise-in`, NOT the landing page's `blur-rise`. The editorial entrance runs
 * 900ms, and 900ms is a welcome; this is a wrong turn, and the reader's only
 * intention is to leave. Six pixels over 280ms with 40ms between the four
 * elements puts the button under their cursor in well under half a second.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-16">
      <div className="max-w-prose text-center">
        <p className="rise-in text-caption text-ink-faint">404</p>
        <h1 className="rise-in mt-4 font-heading text-display-lg text-ink [--stagger-index:1]">
          Nothing here
        </h1>
        <p className="rise-in mt-3 text-body text-ink-muted [--stagger-index:2]">
          That page does not exist, or it belongs to a different account.
        </p>
        <div className="rise-in mt-8 flex justify-center [--stagger-index:3]">
          <Button asChild>
            <Link href="/orders">Back to your orders</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
