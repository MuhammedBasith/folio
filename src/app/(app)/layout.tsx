import { AppHeader } from "@/components/app-header";
import { requireUser } from "@/server/auth/current-user";

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
