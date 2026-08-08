import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/landing/site-header";
import { Hero } from "@/components/landing/hero";
import { ProductPreview } from "@/components/landing/product-preview";
import { HowItWorks } from "@/components/landing/how-it-works";
import { StatusRule, Exactness } from "@/components/landing/arguments";
import { SiteFooter } from "@/components/landing/site-footer";
import { getCurrentUser } from "@/server/auth/current-user";
import { INDEXABLE, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

/**
 * Landing page.
 *
 * Composition only. Every section is its own component so each can be read,
 * changed or removed without scrolling past the others, and so the parts that
 * need client behaviour (the header, the scroll reveals) stay isolated rather
 * than turning the whole page into a client component.
 *
 * The order is an argument, not a list of features:
 *
 *   1. the outcome        what you get
 *   2. the product        what it actually looks like
 *   3. how it works       what you do
 *   4. the status rule    the decision nobody else writes down
 *   5. the arithmetic     why the numbers can be trusted
 *   6. the ask            one button, again
 *
 * Anyone already signed in never sees it. Sending a logged-in user to a page
 * whose main call to action is "open the demo" is a small insult.
 */
/**
 * The canonical and `og:url` live here rather than in the root layout, because
 * every route inherits what the layout sets and only this one is actually "/".
 *
 * Setting `openGraph` at all replaces the root's object wholesale, so the
 * fields that matter are restated rather than added to. Title and description
 * are the site's, because on the landing page they are the same thing.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  robots: INDEXABLE,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "Folio · orders and settlements",
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
};

export default async function LandingPage() {
  if (await getCurrentUser()) {
    redirect("/orders");
  }

  return (
    <div
      /**
       * `overflow-x-clip`, NOT `overflow-hidden`.
       *
       * The gradient plates are wider than the viewport and are meant to bleed
       * from one section into the next, so no section may clip them. Something
       * still has to stop a plate that hangs off the left edge from producing a
       * horizontal scrollbar, and `clip` does exactly that without creating a
       * scroll container the way `hidden` would, which means vertical bleed
       * still works. That distinction is the entire reason this is `clip`.
       */
      data-page="landing"
      className="flex min-h-dvh flex-col overflow-x-clip bg-surface-canvas"
    >
      <SiteHeader />

      <main className="flex-1">
        <Hero />
        <ProductPreview />
        <HowItWorks />
        <StatusRule />
        <Exactness />
      </main>

      <SiteFooter />
    </div>
  );
}
