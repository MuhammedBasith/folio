"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StableLabel } from "@/components/ui/stable-label";
import { Textarea } from "@/components/ui/textarea";
import { buildChaseMessage, type ChaseMessage } from "@/lib/domain/chase";
import type { OrderStatus } from "@/lib/domain/orders";
import { cn } from "@/lib/utils";

const TONE_LABEL: Record<ChaseMessage["tone"], string> = {
  reminder: "Gentle reminder",
  nudge: "Friendly nudge",
  firm: "Firm",
  final: "Final notice",
};

const TONE_STYLE: Record<ChaseMessage["tone"], string> = {
  reminder:
    "bg-status-pending-tint border-status-pending-line text-status-pending-ink",
  nudge:
    "bg-status-partial-tint border-status-partial-line text-status-partial-ink",
  firm: "bg-status-partial-tint border-status-partial-line text-status-partial-ink",
  final:
    "bg-status-overdue-tint border-status-overdue-line text-status-overdue-ink",
};

/**
 * Draft a chase message.
 *
 * The product knows the reference, the balance, how late it is and what has
 * already been paid. Writing that email by hand means looking all four up and
 * then choosing a register, and getting the register wrong is how you annoy a
 * customer who was going to pay anyway. This drafts it and gets out of the way.
 *
 * IT IS EDITABLE BEFORE IT IS COPIED. Generated text that cannot be touched is
 * worse than no generated text, because the one thing the user knows and the
 * software does not is the relationship. The draft is a starting point, and the
 * textarea says so.
 *
 * The tone is shown as a chip rather than left implicit, so the user can see at
 * a glance that the software has decided this is a "final notice" and disagree
 * with it before sending.
 *
 * Nothing is sent. There is no mail transport in this product, and adding one
 * brings secrets, deliverability and a whole class of failure that has nothing
 * to do with a ledger. The clipboard works with whatever they already use.
 */
export function ChaseDialog({
  reference,
  customer,
  dueDate,
  totalCents,
  paidCents,
  dueCents,
  status,
}: {
  reference: string;
  customer: string;
  /** `YYYY-MM-DD`, as the DTO carries it. */
  dueDate: string;
  totalCents: number;
  paidCents: number;
  dueCents: number;
  status: OrderStatus;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState("");
  const [tone, setTone] = useState<ChaseMessage["tone"]>("reminder");
  const [copied, setCopied] = useState(false);

  if (dueCents <= 0 || status === "paid") return null;

  /**
   * Composed on OPEN, not on render.
   *
   * The message depends on how many days late the order is, so building it
   * during render would make the component's output a function of the wall
   * clock and produce a hydration mismatch the moment the server and the client
   * land on different sides of midnight. Opening the dialog is a client-only
   * event, which is exactly when reading the clock is safe.
   */
  function handleOpenChange(next: boolean) {
    setOpen(next);
    setCopied(false);

    if (!next) return;

    const message = buildChaseMessage({
      reference,
      customer,
      dueDate,
      totalCents,
      paidCents,
      dueCents,
      status,
      asOf: new Date(),
    });

    setSubject(message.subject);
    setDraft(message.body);
    setTone(message.tone);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${draft}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused (insecure origin, permissions policy).
      // Selecting the text is the fallback every user already knows, so say so
      // rather than failing silently or throwing a dialog at them.
      setCopied(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          Draft a chase
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="gap-1">
          <div className="flex items-center gap-2.5">
            <DialogTitle className="font-heading text-display-sm text-ink">
              Chase {customer}
            </DialogTitle>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-caption font-medium",
                TONE_STYLE[tone],
              )}
            >
              {TONE_LABEL[tone]}
            </span>
          </div>
          <DialogDescription className="text-body-sm text-ink-muted">
            Drafted from the balance and how late it is. Edit anything before you
            send it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label
            htmlFor="chase-subject"
            className="block text-caption font-medium text-ink-muted"
          >
            Subject
          </label>
          <input
            id="chase-subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="flex h-9 w-full rounded-md border border-line bg-surface-sunken/45 px-3 text-base transition-[border-color,background-color] duration-160 ease-out-quint sm:text-body-sm text-ink focus-visible:border-line-strong/45 focus-visible:bg-surface focus-visible:outline-none"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="chase-body"
            className="block text-caption font-medium text-ink-muted"
          >
            Message
          </label>
          <Textarea
            id="chase-body"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="max-h-72 min-h-56 leading-relaxed"
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line-subtle pt-4">
          <p className="text-caption text-ink-faint">
            Nothing is sent from here.
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleOpenChange(false)}
            >
              Close
            </Button>
            <Button type="button" size="sm" onClick={copy}>
              {copied ? (
                <Check aria-hidden className="size-3.5" />
              ) : (
                <Copy aria-hidden className="size-3.5" />
              )}
              <StableLabel
                options={["Copy", "Copied"]}
                active={copied ? "Copied" : "Copy"}
              />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
