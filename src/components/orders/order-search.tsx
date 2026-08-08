"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Long enough to swallow a burst of typing, short enough to feel live. */
const DEBOUNCE_MS = 200;

/**
 * Search across customer and reference.
 *
 * THE QUERY LIVES IN THE URL, not in React. A filtered view is then shareable,
 * survives a refresh, and the back button undoes the search, which is what
 * every user expects and almost no search box does.
 *
 * The input itself is controlled locally so it never lags a keystroke behind
 * the router, and the URL is written on a 200ms debounce. Without the debounce
 * a nine character customer name is nine navigations, each re-rendering the
 * server component; with it, one.
 *
 * `useTransition` marks the navigation non-urgent, so the previous results stay
 * on screen and dim rather than being replaced by a spinner. Results that
 * flicker to empty and back on every keystroke are harder to read than results
 * that are briefly stale.
 */
export function OrderSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(() => searchParams.get("q") ?? "");

  /**
   * The debounce lives in an effect keyed on the value, rather than in a timer
   * started from the change handler. That way React owns the cleanup: an
   * unmount mid-flight cancels the pending navigation instead of pushing a
   * route for a component that no longer exists.
   */
  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (value === current) return;

    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());

      if (value.trim()) {
        params.set("q", value.trim());
      } else {
        params.delete("q");
      }

      const query = params.toString();

      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, searchParams, pathname, router]);

  return (
    <div
      data-pending={isPending || undefined}
      className={cn(
        "group relative flex h-8 items-center rounded-md border border-line bg-surface-sunken/45",
        "transition-[border-color,box-shadow,background-color,opacity] duration-160 ease-out-quint",
        "focus-within:border-line-strong/45 focus-within:bg-surface focus-within:ring-2 focus-within:ring-(--focus-ring)/12",
        "data-pending:opacity-70",
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
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            // Escape clears rather than blurring. Blurring loses the caret and
            // leaves the query behind, which is the opposite of what the key
            // is for in every other search field.
            event.preventDefault();
            setValue("");
          }
        }}
        // Short enough to fit the field. The longer version was truncated
        // mid-word, and a placeholder that reads "Search customer or referenc"
        // is worse than no placeholder at all. The full description is on the
        // label, where screen readers get it in full and sighted users are not
        // shown a clipped sentence.
        placeholder="Search orders"
        aria-label="Search orders by customer name or reference"
        className={cn(
          "h-full w-40 rounded-md bg-transparent pr-7 pl-8 sm:w-56",
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
            setValue("");
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
