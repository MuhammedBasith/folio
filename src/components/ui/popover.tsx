"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * Popover.
 *
 * The one thing worth pointing at: `transform-origin` is bound to Radix's
 * `--radix-popover-content-transform-origin`, so the panel scales out of the
 * corner nearest its trigger rather than out of its own centre. A popover that
 * grows from the middle appears to have arrived from nowhere; one that grows
 * from the button reads as having come out of the button.
 *
 * That is the opposite of the rule for a modal, which is not anchored to
 * anything and should scale from its centre.
 *
 * It never animates from `scale(0)`. Nothing in the physical world vanishes to
 * a point, and the eye reads it as a glitch rather than as motion.
 */
function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger(
  props: React.ComponentProps<typeof PopoverPrimitive.Trigger>,
) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverAnchor(
  props: React.ComponentProps<typeof PopoverPrimitive.Anchor>,
) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-xl border border-line bg-surface-overlay p-3 text-ink shadow-overlay outline-none",
          "origin-(--radix-popover-content-transform-origin)",
          "ease-out-quint data-open:animate-in data-open:fade-in-0 data-open:zoom-in-96 data-open:duration-160",
          "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-96 data-closed:duration-120",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };
