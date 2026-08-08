import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/landing/site-header";
import { Hero } from "@/components/landing/hero";
import { ProductPreview } from "@/components/landing/product-preview";
import { HowItWorks } from "@/components/landing/how-it-works";
import { StatusRule, Exactness } from "@/components/landing/arguments";
import { SiteFooter } from "@/components/landing/site-footer";
import { getCurrentUser } from "@/server/auth/current-user";

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
export default async function LandingPage() {
  if (await getCurrentUser()) {
    redirect("/orders");
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface-canvas">
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
