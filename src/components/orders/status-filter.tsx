"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/domain/orders";
import { STATUS_DESCRIPTIONS, STATUS_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Status filter.
 *
 * A segmented control, taken from the reference UIs: the selected item is a
 * raised white surface inside a sunken track, which reads as a physical switch
 * rather than as four separate buttons.
 *
 * State lives in the URL, not in React. That makes a filtered view shareable and
 * survivable across a refresh, and it means the back button does what a user
 * expects instead of leaving the page.
 *
 * The counts come from the parent, which already has every order in memory, so
 * showing them costs nothing and turns the filter into a summary as well as a
 * control.
 */
export function StatusFilter({
  counts,
  total,
}: {
  counts: Record<OrderStatus, number>;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const active = searchParams.get("status") ?? "all";

  function select(value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value === "all") {
      params.delete("status");
    } else {
      params.set("status", value);
    }

    const query = params.toString();

    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    });
  }

  const options = [
    { value: "all", label: "All", count: total, description: "Every order." },
    ...ORDER_STATUSES.map((status) => ({
      value: status,
      label: STATUS_LABELS[status],
      count: counts[status],
      description: STATUS_DESCRIPTIONS[status],
    })),
  ];

  return (
    <div
      role="group"
      aria-label="Filter orders by status"
      data-pending={isPending || undefined}
      className={cn(
        "inline-flex w-full gap-1 overflow-x-auto rounded-lg border border-line bg-surface-sunken p-1 sm:w-auto",
        "transition-opacity duration-[160ms] data-pending:opacity-60",
      )}
    >
      {options.map((option) => {
        const selected = active === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => select(option.value)}
            aria-pressed={selected}
            title={option.description}
            className={cn(
              "pressable inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5",
              "text-caption font-medium whitespace-nowrap",
              "transition-colors duration-[160ms] ease-out-quint",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]",
              selected
                ? "bg-surface text-ink shadow-raised"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {option.label}
            <span
              className={cn(
                "text-caption tabular-nums",
                selected ? "text-ink-faint" : "text-ink-disabled",
              )}
            >
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
