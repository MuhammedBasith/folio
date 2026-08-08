"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useLayoutEffect, useRef, useState, useTransition } from "react";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/domain/orders";
import { STATUS_DESCRIPTIONS, STATUS_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Status filter.
 *
 * THE INDICATOR SLIDES. A segmented control whose highlight teleports between
 * options tells the user nothing about the relationship between where they were
 * and where they are; one that travels shows it. This is the clearest case for
 * animating anything in the product: the movement carries meaning, so it earns
 * its 220ms.
 *
 * It is done by measuring the active button and driving a single absolutely
 * positioned element, rather than by toggling a background class per option.
 * That is what makes the motion continuous. `transform` and `width` only, so it
 * stays off the layout path.
 *
 * On the very first paint the indicator is placed without a transition. An
 * element that slides in from the left edge on page load is animating a change
 * that never happened.
 *
 * State lives in the URL, not in React, so a filtered view is shareable,
 * survives a refresh, and the back button does what a user expects.
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

  const listRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  /**
   * Position and "should it animate" are ONE piece of state.
   *
   * Splitting them meant either reading a ref during render or calling setState
   * from an effect to flip a flag, and React's lint rules correctly reject
   * both. Deriving `animate` inside the same update removes the question: it is
   * false on the first placement and true on every one after, which is exactly
   * the rule ("the first position is not a change, so do not animate it").
   */
  const [indicator, setIndicator] = useState<{
    x: number;
    w: number;
    animate: boolean;
    /**
     * True while there are options past the right edge.
     *
     * On a phone the five options do not fit, so the strip scrolls. Without a
     * cue that is invisible: the last option is cut off flush against the
     * border and reads as a rendering mistake rather than as more content. The
     * flag drives a mask that fades the edge, which is the standard way to say
     * "this continues" without spending space on an arrow.
     *
     * It rides in the same state object as the indicator because it comes from
     * the same measurement, on the same scroll and resize events. A second
     * piece of state would be a second render for one number.
     */
    overflowing: boolean;
  } | null>(null);

  const measure = useCallback(() => {
    const button = buttonRefs.current.get(active);
    const list = listRef.current;

    if (!button || !list) return;

    setIndicator((previous) => ({
      x: button.offsetLeft - list.scrollLeft,
      w: button.offsetWidth,
      animate: previous !== null,
      // 1px of tolerance: sub-pixel layout leaves a fractional remainder even
      // when the strip is scrolled fully to its end.
      overflowing:
        list.scrollWidth - list.clientWidth - list.scrollLeft > 1,
    }));
  }, [active]);

  /**
   * Layout effect, not effect: this must run before paint, otherwise the
   * indicator is visibly at the wrong position for one frame.
   */
  useLayoutEffect(() => {
    measure();

    const list = listRef.current;
    if (!list) return;

    // Fonts loading late, or the container resizing, both move the target.
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    list.addEventListener("scroll", measure, { passive: true });

    return () => {
      observer.disconnect();
      list.removeEventListener("scroll", measure);
    };
  }, [measure]);

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
      ref={listRef}
      role="group"
      aria-label="Filter orders by status"
      data-pending={isPending || undefined}
      style={
        indicator?.overflowing
          ? {
              maskImage:
                "linear-gradient(to right, black calc(100% - 2rem), transparent)",
              WebkitMaskImage:
                "linear-gradient(to right, black calc(100% - 2rem), transparent)",
            }
          : undefined
      }
      className={cn(
        // A recessed track, so the raised indicator has something to sit on.
        // The two used to be a hair apart in light mode and the selected tab
        // was, in the user's words, not visible at all: white on near-white,
        // with only a shadow to separate them.
        "relative inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-line bg-surface-sunken p-1",
        "transition-opacity duration-160 data-pending:opacity-70",
        // Hide the scrollbar itself. The mask above is the affordance, and a
        // native bar under a 30px strip is thicker than the content.
        "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      )}
    >
      {indicator ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1 bottom-1 left-0 rounded-md",
            // Raised and bordered, but NOT lit along the top edge. The relief
            // that makes a button read as a cap read here as a bright hairline
            // sitting on top of the tab, so the indicator looked like it had a
            // lid. A segmented control is a flat plate sliding in a track; it
            // wants uniform edges, and the border plus the contact shadow are
            // enough to lift it off the track.
            "bg-surface-raised shadow-raised",
            "border border-line-strong/12",
            indicator.animate
              ? "transition-[transform,width] duration-220 ease-out-quint"
              : // First placement is an ENTRANCE, not a move. It scales up in
                // place rather than sliding in from the left edge, because the
                // first position is not a change from anywhere. `scale` is used
                // as its own property so it composes with the inline
                // `translateX` instead of fighting it.
                "indicator-in",
          )}
          style={{
            transform: `translateX(${indicator.x}px)`,
            width: `${indicator.w}px`,
          }}
        />
      ) : null}

      {options.map((option) => {
        const selected = active === option.value;

        return (
          <button
            key={option.value}
            type="button"
            ref={(node) => {
              if (node) buttonRefs.current.set(option.value, node);
              else buttonRefs.current.delete(option.value);
            }}
            onClick={() => select(option.value)}
            aria-pressed={selected}
            title={option.description}
            className={cn(
              "relative z-10 inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5",
              "text-caption whitespace-nowrap",
              "transition-colors duration-160 ease-out-quint",
              "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-(--focus-ring)",
              // Weight carries the selection as well as the indicator does, so
              // it still reads when the tint alone is ambiguous.
              selected
                ? "font-medium text-ink"
                : "font-normal text-ink-muted hover:text-ink",
            )}
          >
            {option.label}
            <span
              className={cn(
                "tabular-nums transition-colors duration-160",
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
