import { cn } from "@/lib/utils";

/**
 * A label that changes wording without changing width.
 *
 * THE BUG THIS FIXES: "Create order" becoming "Creating" is eleven characters
 * becoming eight, so the button narrows mid-click and everything beside it
 * slides. The user sees the layout twitch at the exact moment they are waiting
 * to find out whether their action worked, which is the worst possible moment
 * for an interface to look unsure of itself. "Copy" becoming "Copied" does the
 * same thing on the other axis.
 *
 * Every option occupies the same grid cell, so the cell is sized to the widest
 * of them and the width is decided once, at render, for all states. Only
 * opacity changes.
 *
 * The visible labels are hidden from assistive technology and a single
 * `sr-only` element carries the current one, otherwise a screen reader would
 * announce all of them at once. `sr-only` is absolutely positioned, so it takes
 * no part in the grid sizing.
 */
export function StableLabel({
  options,
  active,
}: {
  /** Every wording this label can take. Width is the widest of them. */
  options: readonly string[];
  /** Which one to show. Must be one of `options`. */
  active: string;
}) {
  return (
    <span className="grid place-items-center">
      {options.map((option) => (
        <span
          key={option}
          aria-hidden
          className={cn(
            "col-start-1 row-start-1 transition-opacity duration-160 ease-out-quint",
            option === active ? "opacity-100" : "opacity-0",
          )}
        >
          {option}
        </span>
      ))}
      <span className="sr-only">{active}</span>
    </span>
  );
}
