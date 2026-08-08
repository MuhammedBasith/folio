import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Textarea.
 *
 * Same recessed treatment as `Input`, because they are the same kind of thing
 * and a form where one field looks pressed in and the next looks raised reads
 * as two different systems.
 *
 * `field-sizing-content` lets it grow with what is typed, up to a cap. A fixed
 * three-row box hides the end of a long note behind an internal scrollbar,
 * which is a worse way to read your own writing than simply having a taller
 * field. The cap exists so one pasted paragraph cannot push the submit button
 * off the screen. Browsers without support fall back to `min-height`.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field-sizing-content min-h-16 max-h-40 w-full rounded-md border border-line bg-surface-sunken/45 px-3 py-2",
        "text-base sm:text-body-sm text-ink",
        "placeholder:text-ink-disabled",
        "transition-[border-color,box-shadow,background-color] duration-160 ease-out-quint",
        "hover:border-line-strong/25",
        "focus-visible:border-line-strong/45 focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)/12",
        "disabled:cursor-not-allowed disabled:opacity-55",
        "aria-invalid:border-feedback-error-line aria-invalid:bg-feedback-error-tint/35 aria-invalid:ring-2 aria-invalid:ring-feedback-error-line/25",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
