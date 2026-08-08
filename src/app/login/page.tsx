import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/server/auth/current-user";

/**
 * `noindex`, matching the disallow in `robots.ts`.
 *
 * The two are not redundant. A disallow stops a crawler FETCHING the page,
 * which means it never reads the tag below; but a disallowed URL can still be
 * indexed from inbound links alone, listed with no description. The meta tag is
 * what actually keeps it out of the index, and it is the one that applies to
 * anything already crawled before the rule existed.
 *
 * `follow` stays on so the links back into the site are still counted.
 */
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: true },
};

export default async function LoginPage() {
  // Already signed in: send them where they were going rather than showing a
  // form that would immediately bounce them.
  if (await getCurrentUser()) {
    redirect("/orders");
  }

  return <AuthForm mode="login" />;
}
