"use client";

import type { MouseEvent } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";

/**
 * Theme toggle.
 *
 * The click coordinate is passed through to the provider, which uses it as the
 * centre of the circle the new theme expands from. Anchoring the reveal to the
 * pixel the user actually hit is the whole trick: the page appears to change
 * because they touched it there, rather than changing on its own.
 *
 * Keyboard activation reports (0, 0), so it falls back to the centre of the
 * button, which is still the right place for the reveal to start.
 *
 * The two glyphs are stacked in a fixed 16px box and cross-rotate. Nothing here
 * changes layout, so the header cannot shift when the icon swaps: that was a
 * real bug in the previous account control and it is not worth reintroducing
 * for an icon.
 */
function origin(event: MouseEvent<HTMLButtonElement>) {
  if (event.clientX || event.clientY) {
    return { x: event.clientX, y: event.clientY };
  }

  const rect = event.currentTarget.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={(event) => toggleTheme(origin(event))}
      aria-label={label}
      title={label}
      className={cn(
        "pressable grid size-8 shrink-0 place-items-center rounded-full",
        "text-ink-muted transition-colors duration-160 ease-out-quint",
        "hover:bg-action-ghost-hover hover:text-ink",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)",
        className,
      )}
    >
      <span className="relative grid size-4 place-items-center">
        <Glyph active={!isDark}>
          <circle cx="12" cy="12" r="4.1" />
          <path d="M12 2.4v2M12 19.6v2M2.4 12h2M19.6 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M5.2 18.8l1.4-1.4M17.4 6.6l1.4-1.4" />
        </Glyph>
        <Glyph active={isDark}>
          <path d="M20 14.4A8.2 8.2 0 1 1 9.6 4a6.5 6.5 0 0 0 10.4 10.4z" />
        </Glyph>
      </span>
    </button>
  );
}

function Glyph({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        "absolute inset-0 size-4",
        "transition-[opacity,transform] duration-280 ease-out-quint",
        active
          ? "scale-100 rotate-0 opacity-100"
          : "scale-75 -rotate-90 opacity-0",
      )}
    >
      {children}
    </svg>
  );
}
