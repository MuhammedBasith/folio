import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { requireUser } from "@/server/auth/current-user";

/**
 * Nothing behind the login is indexable, declared once for the whole group for
 * the same reason the auth check is: a new route under here should be covered
 * by existing rather than by somebody remembering.
 *
 * The pages inside set only a `title`, and metadata merges by key, so this
 * survives them. Anything that later declares its own `robots` replaces this
 * wholesale, which is worth knowing before writing one.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Shell for every signed-in route.
 *
 * The auth check lives here rather than in each page, so a new route under this
 * group is protected by existing, not by someone remembering to add a guard.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireUser();

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader email={session.email} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
