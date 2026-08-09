"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Copy, Plus, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StableLabel } from "@/components/ui/stable-label";
import { ApiClientError, api } from "@/lib/api-client";
import {
  API_KEY_SCOPES,
  API_KEY_SCOPE_DESCRIPTIONS,
  API_KEY_SCOPE_LABELS,
  type ApiKeyScopeValue,
  EXPIRY_CHOICES,
} from "@/lib/schemas/api-key";
import { cn } from "@/lib/utils";

/**
 * Create an API key.
 *
 * TWO STATES, NOT ONE FORM. Filling the form is one thing; being handed a
 * secret you will never see again is another, and putting them in one view
 * invites somebody to close the dialog with the key still on screen and
 * unread. The second state has no cancel button and says plainly that this is
 * the only time the key exists.
 *
 * DEFAULTS ARE THE SAFE ONES. Read only, expiring in ninety days. The common
 * case, connecting an assistant to ask what is outstanding, needs nothing more,
 * and anybody who genuinely wants a key that can move money has to say so.
 */
export function CreateApiKeyDialog({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<ApiKeyScopeValue>("READ_ONLY");
  const [expiresInDays, setExpiresInDays] = useState<number | null>(90);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /** The plaintext key, held only for as long as this dialog is open. */
  const [created, setCreated] = useState<string | null>(null);

  const busy = submitting || isPending;

  /**
   * Reset on OPEN rather than on close, so the password never lingers in state
   * after the dialog goes away and a reopened dialog always starts clean.
   */
  function handleOpenChange(next: boolean) {
    if (next) {
      setName("");
      setScope("READ_ONLY");
      setExpiresInDays(90);
      setPassword("");
      setError(null);
      setCreated(null);
      setSubmitting(false);
      setOpen(true);
      return;
    }

    setOpen(false);
    setPassword("");

    /**
     * Refresh only when a key was actually minted, so closing a dialog somebody
     * changed their mind about does not re-render the page for nothing.
     */
    if (created) {
      setCreated(null);
      startTransition(() => router.refresh());
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = await api.createApiKey({
        name: name.trim(),
        scope,
        expiresInDays,
        password,
      });

      // Clear the password the instant it is no longer needed.
      setPassword("");
      setCreated(result.key);
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={disabled}>
          <Plus aria-hidden className="size-3.5" />
          New key
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        {created ? (
          <CreatedKey value={created} onDone={() => handleOpenChange(false)} />
        ) : (
          <>
            <DialogHeader className="gap-1">
              <DialogTitle className="font-heading text-display-sm text-ink">
                Create an API key
              </DialogTitle>
              <DialogDescription className="text-body-sm text-ink-muted">
                For connecting Claude Code, a script, or anything else that
                reads this ledger without a browser.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="key-name"
                  className="block text-caption font-medium text-ink-muted"
                >
                  Name
                </label>
                <Input
                  id="key-name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError(null);
                  }}
                  placeholder="Claude Code on my laptop"
                  maxLength={60}
                  autoFocus
                />
                <p className="text-caption text-ink-faint">
                  So you can recognise it later and revoke the right one.
                </p>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-caption font-medium text-ink-muted">
                  Access
                </legend>
                <div className="grid gap-2">
                  {API_KEY_SCOPES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setScope(value)}
                      aria-pressed={scope === value}
                      className={cn(
                        "rounded-xl border px-3.5 py-3 text-left transition-colors duration-160 ease-out-quint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)",
                        scope === value
                          ? "border-line-strong/40 bg-surface-sunken/60"
                          : "border-line hover:border-line-strong/25",
                      )}
                    >
                      <span className="flex items-center gap-2 text-body-sm text-ink">
                        <span
                          aria-hidden
                          className={cn(
                            "grid size-3.5 shrink-0 place-items-center rounded-full border",
                            scope === value
                              ? "border-ink bg-ink"
                              : "border-line-strong/40",
                          )}
                        >
                          {scope === value ? (
                            <span className="size-1 rounded-full bg-surface" />
                          ) : null}
                        </span>
                        {API_KEY_SCOPE_LABELS[value]}
                      </span>
                      <span className="mt-1 block pl-5.5 text-caption text-ink-faint">
                        {API_KEY_SCOPE_DESCRIPTIONS[value]}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-caption font-medium text-ink-muted">
                  Expires
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {EXPIRY_CHOICES.map((choice) => (
                    <button
                      key={choice.label}
                      type="button"
                      onClick={() => setExpiresInDays(choice.days)}
                      aria-pressed={expiresInDays === choice.days}
                      className={cn(
                        "pressable rounded-full border px-3 py-1 text-caption transition-colors duration-160 ease-out-quint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)",
                        expiresInDays === choice.days
                          ? "border-line-strong/40 bg-surface-sunken text-ink"
                          : "border-line text-ink-muted hover:text-ink",
                      )}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
                {expiresInDays === null ? (
                  <p className="text-caption text-ink-faint">
                    A key that never expires is one more thing to remember to
                    revoke.
                  </p>
                ) : null}
              </fieldset>

              <div className="space-y-2 border-t border-line-subtle pt-4">
                <label
                  htmlFor="key-password"
                  className="block text-caption font-medium text-ink-muted"
                >
                  Confirm your password
                </label>
                <Input
                  id="key-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError(null);
                  }}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "key-error" : "key-password-hint"}
                />
                {error ? (
                  <p
                    id="key-error"
                    role="alert"
                    className="text-caption text-feedback-error-ink"
                  >
                    {error}
                  </p>
                ) : (
                  <p id="key-password-hint" className="text-caption text-ink-faint">
                    A key outlives this browser session, so creating one asks for
                    your password again.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-line-subtle pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenChange(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={busy || !name.trim() || !password}
                >
                  <StableLabel
                    options={["Create key", "Creating"]}
                    active={busy ? "Creating" : "Create key"}
                  />
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The one screen where the key exists.
 *
 * It offers the ready-made `claude mcp add` command as well as the raw key,
 * because the reason most people are on this screen is to connect an assistant,
 * and retyping a command with a 43 character secret in it is how keys end up
 * pasted into the wrong window.
 */
function CreatedKey({
  value,
  onDone,
}: {
  value: string;
  onDone: () => void;
}) {
  /**
   * Read at render rather than baked in at build, so a preview deployment
   * prints its own hostname instead of the production one.
   */
  const origin =
    typeof window === "undefined" ? "" : window.location.origin;

  const command = `claude mcp add --transport http folio ${origin}/mcp --header "Authorization: Bearer ${value}"`;

  return (
    <>
      <DialogHeader className="gap-1">
        <DialogTitle className="font-heading text-display-sm text-ink">
          Your new API key
        </DialogTitle>
        <DialogDescription className="text-body-sm text-ink-muted">
          Copy it now. It is stored only as a hash, so this is the one and only
          time it can be shown.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <CopyableBlock label="API key" value={value} />
        <CopyableBlock label="Connect Claude Code" value={command} />

        <p className="flex gap-2 rounded-xl border border-feedback-error-line bg-feedback-error-tint px-3.5 py-3 text-caption text-ink-muted">
          <TriangleAlert
            aria-hidden
            className="mt-px size-3.5 shrink-0 text-feedback-error-ink"
          />
          <span>
            Anyone holding this key can read your ledger. Keep it out of shared
            files and version control. If it escapes, revoke it here and the
            next request using it fails.
          </span>
        </p>

        <div className="flex justify-end border-t border-line-subtle pt-4">
          <Button size="sm" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    </>
  );
}

function CopyableBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleCopy() {
    setFailed(false);

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /**
       * The clipboard API needs a secure context and user permission, and
       * refuses in some browsers. Saying so beats a button that silently does
       * nothing, because the value is still selectable by hand.
       */
      setFailed(true);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-caption font-medium text-ink-muted">{label}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="pressable inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-caption text-ink-muted transition-colors duration-160 ease-out-quint hover:border-line-strong/25 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
        >
          {copied ? (
            <Check aria-hidden className="size-3" />
          ) : (
            <Copy aria-hidden className="size-3" />
          )}
          {copied ? "Copied" : failed ? "Press to copy" : "Copy"}
        </button>
      </div>

      <code className="block overflow-x-auto rounded-xl border border-line bg-surface-sunken/60 px-3.5 py-3 font-mono text-caption break-all text-ink select-all">
        {value}
      </code>

      {failed ? (
        <p role="alert" className="text-caption text-feedback-error-ink">
          Could not reach the clipboard. Select the text above and copy it
          manually.
        </p>
      ) : null}
    </div>
  );
}
