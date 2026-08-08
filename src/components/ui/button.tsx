import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button.
 *
 * Four things are deliberate here, and three of them changed after the controls
 * were judged flat and bulky.
 *
 * 1. FILLED VARIANTS HAVE RELIEF. A one pixel inset highlight along the top
 *    edge, plus the faintest contact shadow underneath. That is all it takes to
 *    read as a cap sitting on the page rather than a rectangle painted onto it.
 *    Nobody will ever consciously see the hairline; remove it and the button
 *    immediately looks like a div.
 *
 * 2. PRESS IS PHYSICAL, NOT JUST SMALLER. `pressable` scales to 0.98 and, more
 *    importantly, kills the relief, so the lit edge goes out as the control
 *    drops below the plane of the light. The travel came down from 3% because
 *    on a wide button that moved each edge far enough to read as the layout
 *    shifting rather than as pressure.
 *
 * 3. SIZES CAME DOWN A STEP. The default is 36px, not 40px. A 40px button in a
 *    dense table view is furniture: it forces the row of controls beside it to
 *    grow, and everything drifts toward the scale of a marketing page.
 *
 * 4. `transition-colors` NOT `transition-all`. Transitioning everything makes
 *    the browser watch properties that never change, and it animates layout
 *    shifts, which always looks broken.
 *
 * The action colour is ink, not the brand coral. That is taken from the
 * reference dashboards, where primary action is black and the only colour on
 * screen carries meaning.
 */
const buttonVariants = cva(
  cn(
    "pressable relative inline-flex shrink-0 items-center justify-center gap-1.5",
    "whitespace-nowrap rounded-md font-medium",
    "transition-[background-color,border-color,color,box-shadow] duration-160 ease-out-quint",
    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)",
    "disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  ),
  {
    variants: {
      variant: {
        primary:
          "bg-action text-action-ink shadow-raised inset-shadow-relief hover:bg-action-hover",
        secondary:
          "border border-line bg-action-soft text-action-soft-ink inset-shadow-relief-soft hover:bg-action-soft-hover hover:border-line-strong/25",
        ghost:
          "text-action-ghost-ink hover:bg-action-ghost-hover hover:text-ink",
        danger:
          "bg-action-danger text-action-danger-ink shadow-raised inset-shadow-relief hover:bg-action-danger-hover",
        link: "text-ink underline decoration-line-strong/30 underline-offset-4 hover:decoration-line-strong",
      },
      size: {
        xs: "h-7 gap-1 rounded-sm px-2.5 text-caption",
        sm: "h-8 px-3 text-caption",
        md: "h-9 px-3.5 text-body-sm",
        lg: "h-10 px-4.5 text-body-sm",
        icon: "size-8",
        "icon-sm": "size-7 rounded-sm",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
