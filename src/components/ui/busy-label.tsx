import { cn } from "@/lib/utils";

/**
 * A button label that changes wording without changing width.
 *
 * THE BUG THIS FIXES: "Create order" becoming "Creating" is eleven characters
 * becoming eight, so the button narrows mid-click and everything beside it
 * slides. The user sees the layout twitch at the exact moment they are waiting
 * to find out whether their action worked, which is the worst possible moment
 * for the interface to look unsure of itself.
 *
 * Both labels occupy the same grid cell, so the cell is sized to the wider of
 * the two and the button's width is decided once, at render, for both states.
 * Only opacity changes.
 *
 * The visible labels are hidden from assistive technology and a single
 * `sr-only` element carries the current one, otherwise a screen reader would
 * announce both at once. `sr-only` is absolutely positioned, so it does not
 * take part in the grid.
 */
export function BusyLabel({
  busy,
  idle,
  pending,
}: {
  busy: boolean;
  idle: string;
  pending: string;
}) {
  return (
    <span className="grid place-items-center">
      <span
        aria-hidden
        className={cn(
          "col-start-1 row-start-1 transition-opacity duration-160 ease-out-quint",
          busy && "opacity-0",
        )}
      >
        {idle}
      </span>
      <span
        aria-hidden
        className={cn(
          "col-start-1 row-start-1 transition-opacity duration-160 ease-out-quint",
          !busy && "opacity-0",
        )}
      >
        {pending}
      </span>
      <span className="sr-only">{busy ? pending : idle}</span>
    </span>
  );
}
