"use client";

import { useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Search across customer and reference.
 *
 * CONTROLLED, AND NOTHING IS DEBOUNCED ANY MORE. It used to hold its own value,
 * debounce it, and push it through the router, because filtering happened on
 * the server and a navigation per keystroke would have been absurd. Filtering
 * now happens in the browser over rows that are already loaded, so there is
 * nothing to wait for: every character narrows the table on the same frame.
 *
 * The parent still records the query in the URL, on a `replaceState` rather
 * than a push, so a search is shareable without leaving one history entry per
 * letter typed.
 */
export function OrderSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={cn(
        // Full width on a phone, where the toolbar wraps and this gets its own
        // line anyway. A 160px field sitting alone on a 390px row is not
        // restraint, it is a field that could not fit its own placeholder.
        "group relative flex h-8 w-full items-center rounded-md border border-line bg-surface-sunken/45 sm:w-auto",
        "transition-[border-color,box-shadow,background-color] duration-160 ease-out-quint",
        "focus-within:border-line-strong/45 focus-within:bg-surface focus-within:ring-2 focus-within:ring-(--focus-ring)/12",
      )}
    >
      <Search
        aria-hidden
        className="pointer-events-none absolute left-2.5 size-3.5 text-ink-disabled transition-colors duration-160 group-focus-within:text-ink-faint"
      />

      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            // Escape clears rather than blurring. Blurring loses the caret and
            // leaves the query behind, which is the opposite of what the key
            // is for in every other search field.
            event.preventDefault();
            onChange("");
          }
        }}
        placeholder="Search orders"
        aria-label="Search orders by customer name or reference"
        className={cn(
          "h-full w-full rounded-md bg-transparent pr-7 pl-8 sm:w-56",
          // 16px on phones so iOS Safari does not zoom the viewport on focus
          // and then refuse to zoom back out.
          "text-base sm:text-caption text-ink placeholder:text-ink-disabled",
          "outline-none",
          // Safari draws its own clear button on `type=search`, which would sit
          // next to ours at a different size.
          "[&::-webkit-search-cancel-button]:appearance-none",
        )}
      />

      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute right-1.5 grid size-5 place-items-center rounded-sm text-ink-disabled transition-colors duration-160 hover:bg-action-ghost-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-ring)"
        >
          <X aria-hidden className="size-3" />
        </button>
      ) : null}
    </div>
  );
}
