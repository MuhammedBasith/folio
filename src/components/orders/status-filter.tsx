"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/domain/orders";
import { STATUS_DESCRIPTIONS, STATUS_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Status filter.
 *
 * CONTROLLED, AND IT OWNS NO ROUTING. It used to call `router.replace` itself,
 * which meant pressing a tab waited on a server round trip before anything
 * moved. The parent now decides what a selection means; this component's whole
 * job is to look right and move well, and it re-renders the instant its `value`
 * prop changes.
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
 */
export function StatusFilter({
  counts,
  total,
  value,
  onSelect,
}: {
  counts: Record<OrderStatus, number>;
  total: number;
  /** The selected option: a status, or "all". */
  value: string;
  onSelect: (value: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());

  /**
   * Position, "should it animate", and "is there more to the right" are ONE
   * piece of state.
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
     * border and reads as a rendering mistake rather than as more content.
     */
    overflowing: boolean;
  } | null>(null);

  const measure = useCallback(() => {
    const button = buttonRefs.current.get(value);
    const list = listRef.current;

    if (!button || !list) return;

    setIndicator((previous) => ({
      x: button.offsetLeft - list.scrollLeft,
      w: button.offsetWidth,
      animate: previous !== null,
      // 1px of tolerance: sub-pixel layout leaves a fractional remainder even
      // when the strip is scrolled fully to its end.
      overflowing: list.scrollWidth - list.clientWidth - list.scrollLeft > 1,
    }));
  }, [value]);

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
        "relative inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-line bg-surface-sunken p-1",
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
            // Raised and bordered, but NOT lit along the top edge. A segmented
            // control is a flat plate sliding in a track; it wants uniform
            // edges, and the border plus the contact shadow are enough to lift
            // it off the track.
            "bg-surface-raised shadow-raised",
            "border border-line-strong/12",
            indicator.animate
              ? "transition-[transform,width] duration-220 ease-out-quint"
              : // First placement is an ENTRANCE, not a move. It scales up in
                // place rather than sliding in from the left edge, because the
                // first position is not a change from anywhere.
                "indicator-in",
          )}
          style={{
            transform: `translateX(${indicator.x}px)`,
            width: `${indicator.w}px`,
          }}
        />
      ) : null}

      {options.map((option) => {
        const selected = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            ref={(node) => {
              if (node) buttonRefs.current.set(option.value, node);
              else buttonRefs.current.delete(option.value);
            }}
            onClick={() => onSelect(option.value)}
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
