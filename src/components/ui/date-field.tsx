"use client";

import { useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Date field.
 *
 * WHY NOT `<input type="date">`. The native control was doing four things this
 * design cannot live with: it renders a different widget in every browser and a
 * full-screen wheel on iOS, it shows a locale-dependent numeric format
 * (22/08/2026, which is a different date in half the world), its calendar
 * button cannot be styled at all, and it ignores every token in this system. On
 * a screen where the due date decides whether an order reads as overdue, an
 * ambiguous date format is a correctness problem, not a styling one.
 *
 * WHY NOT A LIBRARY. react-day-picker is 30kb for a month grid, a keyboard map
 * and a disabled rule. The whole implementation below is about 200 lines and
 * everything in it is a decision this design has an opinion about.
 *
 * DATES ARE STRINGS, NEVER `Date` OBJECTS, at the boundary. The value in and out
 * is `YYYY-MM-DD`, matching what the API takes and what the database stores.
 * `Date` is used only for grid arithmetic, constructed with the local
 * constructor so "the 22nd" is the 22nd on the user's calendar rather than
 * whatever midnight UTC happens to be where they are.
 */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface DateParts {
  year: number;
  month: number; // 0-indexed, matching Date
  day: number;
}

function parseIso(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);

  // Round-trip through Date to reject 2026-02-31 and friends, which pass the
  // regex and would otherwise silently roll forward into March.
  const date = new Date(year, month, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function toIso({ year, month, day }: DateParts): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayParts(): DateParts {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

function addDays(parts: DateParts, days: number): DateParts {
  const date = new Date(parts.year, parts.month, parts.day + days);
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
  };
}

/** Long form, unambiguous in every locale: "22 Aug 2026". */
function formatLong(parts: DateParts): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(parts.year, parts.month, parts.day));
}

function formatMonth(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month, 1));
}

/**
 * Six weeks of days, always.
 *
 * A grid that is five rows in February and six in March resizes the popover as
 * you page through the year, and the buttons under the cursor move. Padding to
 * a fixed 42 cells costs one row of greyed dates and buys a panel that never
 * changes height.
 */
function buildGrid(year: number, month: number): DateParts[] {
  const first = new Date(year, month, 1);
  // getDay() is Sunday-first; this shifts to Monday-first.
  const leading = (first.getDay() + 6) % 7;

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, month, index + 1 - leading);
    return {
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate(),
    };
  });
}

export function DateField({
  id,
  value,
  onChange,
  min,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Earliest selectable date, as `YYYY-MM-DD`. */
  min?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const selected = parseIso(value);
  const today = todayParts();

  const [open, setOpen] = useState(false);
  // The month on screen, which is not the same thing as the selection: paging
  // to December should not select a day in December.
  const [view, setView] = useState(() => ({
    year: (selected ?? today).year,
    month: (selected ?? today).month,
  }));
  const [focused, setFocused] = useState<DateParts>(selected ?? today);
  const gridRef = useRef<HTMLDivElement>(null);

  const grid = useMemo(() => buildGrid(view.year, view.month), [view]);

  const isDisabled = (parts: DateParts) => Boolean(min && toIso(parts) < min);

  function select(parts: DateParts) {
    if (isDisabled(parts)) return;
    onChange(toIso(parts));
    setOpen(false);
  }

  function moveFocus(days: number) {
    const next = addDays(focused, days);
    setFocused(next);
    setView({ year: next.year, month: next.month });

    // The focused cell may have just been rendered by this same update, so the
    // DOM move waits a frame. Without it the focus lands on the old node and
    // arrow keys stop working the moment you cross a month boundary.
    requestAnimationFrame(() => {
      gridRef.current
        ?.querySelector<HTMLButtonElement>(`[data-iso="${toIso(next)}"]`)
        ?.focus();
    });
  }

  function onGridKeyDown(event: React.KeyboardEvent) {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };

    if (event.key in moves) {
      event.preventDefault();
      moveFocus(moves[event.key]);
      return;
    }

    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      shiftMonth(event.key === "PageUp" ? -1 : 1);
    }
  }

  function shiftMonth(delta: number) {
    setView((current) => {
      const date = new Date(current.year, current.month + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/*
          `data-invalid`, not `aria-invalid`.

          `aria-invalid` is only defined for roles that take user input, and
          this is a button that opens a dialog. Applying it here is invalid ARIA
          that some screen readers ignore and others announce wrongly. The error
          reaches assistive technology through `aria-describedby` pointing at
          the message, which carries `role="alert"` and is announced when it
          appears; the attribute below exists purely so CSS has something to
          hang the red state on.
        */}
        <button
          id={id}
          type="button"
          data-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-line bg-surface-sunken/45 px-3",
            "text-body-sm text-ink",
            "transition-[border-color,box-shadow,background-color] duration-160 ease-out-quint",
            "hover:border-line-strong/25",
            "focus-visible:border-line-strong/45 focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)/12",
            "data-[state=open]:border-line-strong/45 data-[state=open]:bg-surface",
            "data-invalid:border-feedback-error-line data-invalid:bg-feedback-error-tint/35 data-invalid:ring-2 data-invalid:ring-feedback-error-line/25",
          )}
        >
          <span className={selected ? "tabular-nums" : "text-ink-disabled"}>
            {selected ? formatLong(selected) : "Choose a date"}
          </span>
          <CalendarDays aria-hidden className="size-3.5 shrink-0 text-ink-faint" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-70">
        {/* ---- Month header ---- */}
        <div className="flex items-center justify-between gap-2">
          <NavButton
            label="Previous month"
            onClick={() => shiftMonth(-1)}
            icon={<ChevronLeft aria-hidden className="size-3.5" />}
          />
          <span
            aria-live="polite"
            className="text-body-sm font-medium text-ink"
          >
            {formatMonth(view.year, view.month)}
          </span>
          <NavButton
            label="Next month"
            onClick={() => shiftMonth(1)}
            icon={<ChevronRight aria-hidden className="size-3.5" />}
          />
        </div>

        {/* ---- Weekday row ---- */}
        <div className="mt-3 grid grid-cols-7 gap-0.5">
          {WEEKDAYS.map((weekday) => (
            <abbr
              key={weekday}
              title={weekday}
              // The single letter is enough at this size, and the full name
              // stays available to a screen reader and on hover.
              className="grid h-6 place-items-center text-caption text-ink-disabled no-underline"
            >
              {weekday.slice(0, 1)}
            </abbr>
          ))}
        </div>

        {/* ---- Days ---- */}
        <div
          ref={gridRef}
          role="grid"
          aria-label={formatMonth(view.year, view.month)}
          onKeyDown={onGridKeyDown}
          className="mt-0.5 grid grid-cols-7 gap-0.5"
        >
          {grid.map((parts) => {
            const iso = toIso(parts);
            const outside = parts.month !== view.month;
            const isSelected = selected != null && iso === toIso(selected);
            const isToday = iso === toIso(today);
            const disabled = isDisabled(parts);

            return (
              <button
                key={iso}
                type="button"
                role="gridcell"
                data-iso={iso}
                disabled={disabled}
                aria-selected={isSelected}
                aria-current={isToday ? "date" : undefined}
                // Roving tabindex: one stop for the whole grid, then arrow keys
                // inside it. Forty-two tab stops would be its own accessibility
                // problem.
                tabIndex={iso === toIso(focused) ? 0 : -1}
                onFocus={() => setFocused(parts)}
                onClick={() => select(parts)}
                className={cn(
                  "grid h-8 place-items-center rounded-md text-body-sm tabular-nums",
                  "transition-colors duration-120 ease-out-quint",
                  "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-(--focus-ring)",
                  "disabled:cursor-not-allowed disabled:text-ink-disabled disabled:opacity-45 disabled:hover:bg-transparent",
                  outside ? "text-ink-disabled" : "text-ink",
                  isSelected
                    ? "bg-action text-action-ink hover:bg-action-hover"
                    : "hover:bg-action-ghost-hover",
                  // Today gets a ring rather than a fill, so it can coexist
                  // with the selection instead of competing with it.
                  isToday && !isSelected && "ring-1 ring-line-strong/35",
                )}
              >
                {parts.day}
              </button>
            );
          })}
        </div>

        {/*
          ---- Shortcuts ----

          A due date is almost never picked from a calendar in the abstract; it
          is "two weeks from now" or "end of the month". Offering those directly
          skips the paging for the common cases, and the calendar is still there
          for the rest.
        */}
        <div className="mt-3 flex gap-1 border-t border-line-subtle pt-3">
          {[
            { label: "Today", days: 0 },
            { label: "2 weeks", days: 14 },
            { label: "30 days", days: 30 },
          ].map((shortcut) => (
            <button
              key={shortcut.label}
              type="button"
              onClick={() => select(addDays(today, shortcut.days))}
              className="flex-1 rounded-md px-2 py-1.5 text-caption text-ink-muted transition-colors duration-120 ease-out-quint hover:bg-action-ghost-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-ring)"
            >
              {shortcut.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NavButton({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-7 shrink-0 place-items-center rounded-md text-ink-faint transition-colors duration-120 ease-out-quint hover:bg-action-ghost-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-ring)"
    >
      {icon}
    </button>
  );
}
