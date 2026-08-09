import type { Metadata } from "next";
import { ApiKeyList } from "@/components/settings/api-key-list";
import { requireUser } from "@/server/auth/current-user";
import { listApiKeys } from "@/server/repositories/api-keys";

export const metadata: Metadata = {
  title: "Settings",
};

/**
 * Settings.
 *
 * A Server Component reading the repository directly, like every other screen
 * here: the HTML arrives with the list in it, no client fetch and no spinner.
 *
 * It sits inside the `(app)` route group, so the authentication guard in that
 * group's layout covers it. Nothing on this page re-checks who the caller is,
 * because a check repeated per page is a check that will eventually be missed
 * on a new one.
 *
 * NOTE WHAT THIS PAGE NEVER TOUCHES: no key material reaches it. `listApiKeys`
 * does not select the `hash` column, and there is no query anywhere that could
 * return a key's secret, because the secret was never written down.
 */
export default async function SettingsPage() {
  const session = await requireUser();
  const apiKeys = await listApiKeys(session.userId);

  return (
    <main className="mx-auto w-full max-w-content px-5 py-7 md:px-8 md:py-9">
      <div>
        <h1 className="font-heading text-display text-ink">Settings</h1>
        <p className="mt-0.5 text-caption text-ink-faint">{session.email}</p>
      </div>

      <section className="mt-8">
        <ApiKeyList apiKeys={apiKeys} />

        <div className="mt-5 rounded-xl border border-line bg-surface-sunken/40 px-4 py-3.5">
          <p className="text-caption text-ink-muted">
            An API key lets a tool read this ledger without a browser. Send it as{" "}
            <code className="font-mono text-ink">
              Authorization: Bearer &lt;key&gt;
            </code>{" "}
            to the REST API, or point an assistant at{" "}
            <code className="font-mono text-ink">/mcp</code> to let it answer
            questions like who owes you money.
          </p>
          <p className="mt-2 text-caption text-ink-faint">
            Keys can read and, if you allow it, add orders and record payments.
            They can never edit or delete anything, and they cannot create or
            revoke other keys: that needs your password here.
          </p>
        </div>
      </section>
    </main>
  );
}
