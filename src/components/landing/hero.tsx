import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GradientPlate } from "@/components/landing/gradient-plate";
import { Money } from "@/components/money";
import { StatusDot } from "@/components/status-badge";

/**
 * Hero.
 *
 * ONE CALL TO ACTION. There were two, and a second button beside the first
 * halves the weight of both: the reader stops deciding whether to act and
 * starts deciding which button to press. Creating an account is still reachable
 * as a plain text link, which is the correct weight for the thing almost nobody
 * does first.
 *
 * The headline is the outcome, not the mechanism. Nobody wants order tracking
 * software; they want to know who owes them money.
 *
 * The visual underneath is made of real product fragments sitting on coloured
 * light. Not a rendered laptop, not a dashboard mockup with invented charts:
 * three pieces of the actual interface, at the actual sizes, showing the three
 * things this product does. The gradient is what makes it feel alive; the
 * fragments are what make it honest.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden px-5 pt-28 pb-4 md:px-8 md:pt-32">
      {/*
        The top padding above clears the fixed header. It is a plain value
        rather than anything measured: the header is 56px tall at rest and this
        is the only page it floats over, so a variable would be indirection for
        one number.
      */}
      {/*
        The light sits BELOW the headline, not behind it. A glow behind
        centred type makes the type look like it is being lit from a lamp
        somebody left on; putting it under the fragments makes the fragments
        look like they are floating above something.
      */}
      <GradientPlate
        src="/gradients/signal.webp"
        priority
        className="top-[46%] left-1/2 h-128 w-[min(74rem,146%)] -translate-x-1/2"
        opacity="opacity-58 dark:opacity-28"
      />
      <GradientPlate
        src="/gradients/mist.webp"
        className="top-[44%] left-[-16%] h-96 w-lg"
        opacity="opacity-35 dark:opacity-18"
      />

      <div className="relative mx-auto max-w-3xl text-center">
        {/*
          The eyebrow belongs TO the headline, so it sits close to it. At mt-5
          the two read as separate paragraphs that happen to be stacked, and the
          eyebrow lost its job of introducing the line under it.
        */}
        <p className="blur-rise text-caption text-ink-faint">
          Orders and settlements
        </p>

        <h1 className="blur-rise mt-2.5 font-heading text-display-hero text-balance text-ink [--stagger-index:1]">
          Know exactly who owes you what.
        </h1>

        <p className="blur-rise mx-auto mt-5 max-w-xl text-body-lg text-ink-muted [--stagger-index:2]">
          Write down what a customer ordered. Record each payment as it lands.
          Folio works out the balance, decides whether the order is short or
          late, and keeps the arithmetic exact to the cent.
        </p>

        <div className="blur-rise mt-8 flex flex-col items-center gap-3.5 [--stagger-index:3]">
          <Button asChild size="lg" className="rounded-lg px-6">
            <Link href="/login">Open the demo</Link>
          </Button>
          <p className="text-caption text-ink-faint">
            Loaded with real orders.{" "}
            <Link
              href="/signup"
              className="text-ink-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-line-strong"
            >
              Or start your own
            </Link>
          </p>
        </div>
      </div>

      <HeroFragments />
    </section>
  );
}

/**
 * The three floating pieces.
 *
 * TWO LAYOUTS, NOT ONE THAT SHRINKS. From `sm` up they are absolutely
 * positioned so they can overlap and sit at different depths, which is the
 * whole reason they read as floating rather than as a row of three cards. Below
 * `sm` that same arrangement is three 280px cards inside a 350px column, which
 * is not a composition, it is a pile: they stack in normal flow instead.
 */
function HeroFragments() {
  return (
    <div className="relative mx-auto mt-10 flex w-full max-w-4xl flex-col items-center gap-3 sm:mt-12 sm:block sm:h-72 md:mt-14">
      {/* Left: an order, as it appears in the list. */}
      <Fragment index={0} className="sm:absolute sm:top-10 sm:left-0 sm:w-76 md:left-2">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-caption text-ink-faint tabular-nums">
            ORD-0002
          </span>
          <StatusDot status="overdue" className="text-caption" />
        </div>
        <p className="mt-2 text-body font-medium text-ink">Acme Corp</p>
        <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-line-subtle pt-2.5">
          <span className="text-caption text-ink-faint">Still due</span>
          <Money cents={119_600} tone="strong" className="text-metric" />
        </div>
      </Fragment>

      {/* Centre: a payment landing. The smallest card, so it reads as a moment
          rather than as a third panel. */}
      <Fragment
        index={1}
        className="sm:absolute sm:top-0 sm:left-1/2 sm:w-62 sm:-translate-x-1/2"
      >
        <p className="text-caption text-ink-faint">Payment recorded</p>
        <p className="mt-1.5 text-metric-lg text-ink">
          <Money cents={94_700} />
        </p>
        <p className="mt-1 text-caption text-ink-muted">
          Balance cleared · 4 Jul
        </p>
      </Fragment>

      {/* Right: the outcome. */}
      <Fragment
        index={2}
        className="sm:absolute sm:top-28 sm:right-0 sm:w-68 md:right-2"
      >
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-caption text-ink-faint tabular-nums">
            ORD-0005
          </span>
          <StatusDot status="paid" className="text-caption" />
        </div>
        <p className="mt-2 text-body font-medium text-ink">Harbour Logistics</p>
        <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-line-subtle pt-2.5">
          <span className="text-caption text-ink-faint">Still due</span>
          <Money cents={0} tone="muted" className="text-metric" />
        </div>
      </Fragment>
    </div>
  );
}

function Fragment({
  index,
  className,
  children,
}: {
  index: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-hidden
      style={{ "--stagger-index": index + 4 } as React.CSSProperties}
      className={`blur-rise w-full max-w-xs rounded-xl border border-line bg-surface-raised/86 p-4 shadow-overlay backdrop-blur-md sm:max-w-none ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
