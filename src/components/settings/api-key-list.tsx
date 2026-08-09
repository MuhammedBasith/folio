"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StableLabel } from "@/components/ui/stable-label";
import { ApiClientError, api } from "@/lib/api-client";
import {
  type ApiKeyDto,
  API_KEY_SCOPE_LABELS,
  MAX_ACTIVE_API_KEYS,
} from "@/lib/schemas/api-key";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CreateApiKeyDialog } from "./create-api-key-dialog";

/**
 * The key list.
 *
 * WHAT EACH ROW IS FOR IS "should this still exist". That is the only decision
 * anybody makes on this screen, so the row leads with the name they chose, and
 * carries the two facts that answer it: what the key can do, and when it was
 * last used. A key nobody recognises that was used an hour ago is the shape a
 * leak actually has, and it is invisible unless last use is on the row.
 *
 * Revoked and expired keys stay listed, greyed. Removing them would tidy away
 * exactly the evidence somebody wants after an incident, and the row still
 * carries the last time the key was used.
 */
export function ApiKeyList({ apiKeys }: { apiKeys: ApiKeyDto[] }) {
  const active = apiKeys.filter((key) => key.status === "active");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-display-sm text-ink">API keys</h2>
          <p className="mt-0.5 text-caption text-ink-faint">
            {active.length} active
            {active.length >= MAX_ACTIVE_API_KEYS
              ? ` · limit of ${MAX_ACTIVE_API_KEYS} reached`
              : ""}
          </p>
        </div>

        <CreateApiKeyDialog disabled={active.length >= MAX_ACTIVE_API_KEYS} />
      </div>

      {apiKeys.length === 0 ? (
        <p className="mt-5 rounded-xl border border-line border-dashed bg-surface-raised px-4 py-6 text-center text-body-sm text-ink-muted">
          No keys yet. Create one to let Claude Code, a script, or another tool
          read this ledger.
        </p>
      ) : (
        <ul className="mt-5 overflow-hidden rounded-xl border border-line bg-surface-raised">
          {apiKeys.map((apiKey, index) => (
            <ApiKeyRow key={apiKey.id} apiKey={apiKey} index={index} />
          ))}
        </ul>
      )}
    </>
  );
}

function ApiKeyRow({ apiKey, index }: { apiKey: ApiKeyDto; index: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = apiKey.status === "active";
  const busy = revoking || isPending;

  async function handleRevoke() {
    setError(null);
    setRevoking(true);

    try {
      await api.revokeApiKey(apiKey.id);
      setConfirming(false);
      startTransition(() => router.refresh());
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "Could not revoke that key. Please try again.",
      );
    } finally {
      setRevoking(false);
    }
  }

  return (
    <li
      style={{ "--stagger-index": Math.min(index, 8) } as React.CSSProperties}
      className="rise-in border-b border-line-subtle px-4 py-3.5 last:border-b-0"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <div className="min-w-0">
          <p
            className={cn(
              "truncate text-body-sm",
              live ? "text-ink" : "text-ink-faint line-through",
            )}
          >
            {apiKey.name}
          </p>

          {/*
            SPACED, NOT SEPARATED BY INTERPUNCTS. The obvious treatment puts a
            "·" between each fact, and it reads well on one line and badly on
            two: when the row wraps on a phone, the separator is left dangling
            at the end of a line with nothing after it. Gaps carry the same
            grouping at every width and cannot strand punctuation.
          */}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-ink-faint">
            {/*
              The last four characters, which is all that is kept for display.
              Enough to tell two keys apart on this screen, and 24 bits of a
              256 bit secret, which is nothing.
            */}
            <code className="font-mono">folio_sk_…{apiKey.last4}</code>
            <span>{API_KEY_SCOPE_LABELS[apiKey.scope]}</span>
            <span>
              {apiKey.lastUsedAt
                ? `Last used ${formatDate(apiKey.lastUsedAt.slice(0, 10))}`
                : "Never used"}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <StatusChip apiKey={apiKey} />

          {live ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setConfirming(true)}
              disabled={busy}
            >
              Revoke
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-caption text-feedback-error-ink">
          {error}
        </p>
      ) : null}

      {/*
        A confirm step, because revoking is instant and irreversible: the key
        cannot be un-revoked, only replaced. One dialog is cheaper than a
        support conversation about an automation that stopped at 3am.
      */}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="gap-1">
            <DialogTitle className="font-heading text-display-sm text-ink">
              Revoke this key?
            </DialogTitle>
            <DialogDescription className="text-body-sm text-ink-muted">
              <span className="text-ink">{apiKey.name}</span> stops working
              immediately, and anything using it starts failing. This cannot be
              undone: you would create a new key instead.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-end gap-2 border-t border-line-subtle pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleRevoke}
              disabled={busy}
            >
              <StableLabel
                options={["Revoke key", "Revoking"]}
                active={busy ? "Revoking" : "Revoke key"}
              />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}

/**
 * Colour is information here and nowhere else on the row: an active key is
 * unremarkable and gets no chip at all beyond its expiry, while revoked and
 * expired earn a muted one. A screen where every row is decorated says nothing.
 */
function StatusChip({ apiKey }: { apiKey: ApiKeyDto }) {
  if (apiKey.status === "revoked") {
    return (
      <span className="rounded-full border border-line px-2 py-0.5 text-caption text-ink-faint">
        Revoked
      </span>
    );
  }

  if (apiKey.status === "expired") {
    return (
      <span className="rounded-full border border-line px-2 py-0.5 text-caption text-ink-faint">
        Expired
      </span>
    );
  }

  return (
    <span className="text-caption text-ink-faint">
      {apiKey.expiresAt
        ? `Expires ${formatDate(apiKey.expiresAt.slice(0, 10))}`
        : "No expiry"}
    </span>
  );
}
