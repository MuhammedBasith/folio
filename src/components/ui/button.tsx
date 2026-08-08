import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button.
 *
 * Rewritten onto the token layer. Three things are deliberate:
 *
 * 1. PRESS FEEDBACK IS ASYMMETRIC. `pressable` scales to 0.97 in 100ms with a
 *    hard ease-out, then releases over 160ms with a slight overshoot. Fast
 *    acknowledgement, unhurried settle. See `src/styles/base.css`.
 *
 * 2. HOVER IS GATED behind `@media (hover: hover)` via the `hover:` variant
 *    plus Tailwind's own pointer handling, so a tap on a phone does not leave a
 *    button stuck in its hover state.
 *
 * 3. `transition-colors` NOT `transition-all`. Transitioning everything means
 *    the browser watches properties that never change, and it makes layout
 *    shifts animate, which always looks broken.
 *
 * The accent is ink, not a colour. That is taken straight from the reference
 * dashboards, where selection and primary action are black and the only colour
 * on screen carries meaning.
 */
const buttonVariants = cva(
  cn(
    "pressable inline-flex shrink-0 items-center justify-center gap-2",
    "whitespace-nowrap rounded-md font-medium",
    "transition-colors duration-[160ms] ease-out-quint",
    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ),
  {
    variants: {
      variant: {
        primary: "bg-action text-action-ink hover:bg-action-hover",
        secondary:
          "border border-line bg-action-soft text-action-soft-ink hover:bg-action-soft-hover",
        ghost:
          "text-action-ghost-ink hover:bg-action-ghost-hover hover:text-ink",
        danger:
          "bg-action-danger text-action-danger-ink hover:bg-action-danger-hover",
        link: "text-ink underline decoration-line-strong/30 underline-offset-4 hover:decoration-line-strong",
      },
      size: {
        sm: "h-8 px-3 text-caption",
        md: "h-10 px-4 text-body-sm",
        lg: "h-11 px-5 text-body-sm",
        icon: "size-10",
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
