import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Input.
 *
 * `aria-invalid` drives the error styling rather than a separate prop, so the
 * visual state and the state announced to a screen reader cannot disagree.
 *
 * Height matches the 36px button so a field and the control beside it line up
 * without either being nudged. It is a recessed surface rather than the page
 * colour, which is the counterpart to the raised treatment on buttons: things
 * you type into sit below the plane, things you press sit above it.
 *
 * `text-base` below the `sm` breakpoint is not a style choice: iOS Safari zooms
 * the viewport when a focused input's font size is under 16px, and the page
 * never zooms back out.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-md border border-line bg-surface-sunken/45 px-3",
        "text-base sm:text-body-sm text-ink",
        "placeholder:text-ink-disabled",
        "transition-[border-color,box-shadow,background-color] duration-160 ease-out-quint",
        "hover:border-line-strong/25",
        "focus-visible:border-line-strong/45 focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)/12",
        "disabled:cursor-not-allowed disabled:opacity-55",
        "aria-invalid:border-feedback-error-line aria-invalid:bg-feedback-error-tint/35 aria-invalid:ring-2 aria-invalid:ring-feedback-error-line/25",
        "file:inline-flex file:border-0 file:bg-transparent file:text-body-sm file:font-medium",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
