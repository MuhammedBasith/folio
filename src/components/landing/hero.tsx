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
    <section className="relative px-5 pt-28 pb-4 md:px-8 md:pt-32">
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
        className="top-[52%] left-1/2 h-[36rem] w-[min(60rem,120%)] -translate-x-1/2"
        opacity="opacity-70 dark:opacity-40"
      />
      <GradientPlate
        src="/gradients/mist.webp"
        // Barely there in light mode: the sage in this plate turns grey against
        // warm paper, and a grey smudge beside a coral glow reads as a smear
        // rather than as a second light source.
        className="top-[56%] left-[-10%] h-80 w-[28rem]"
        opacity="opacity-[0.18] dark:opacity-20"
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

        {/*
          THE SENTENCE GETS SHORTER ON A PHONE, IT IS NOT A SECOND COPY OF IT.

          The full version runs to five lines on a 390px screen, which is a wall
          of grey directly under the headline and the point where a reader
          scrolls past. Rather than write the paragraph twice, the shared part
          is written once and only the tail differs: `display: none` also takes
          the hidden tail out of the accessibility tree, so a phone reader hears
          the short version rather than both.
        */}
        <p className="blur-rise mx-auto mt-5 max-w-xl text-body-lg text-ink-muted [--stagger-index:2]">
          Write down what a customer ordered. Record each payment as it lands.
          Folio works out the balance
          <span className="sm:hidden"> and the status.</span>
          <span className="hidden sm:inline">
            , decides whether the order is short or late, and keeps the
            arithmetic exact to the cent.
          </span>
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
 * positioned so they can sit at different depths across the full width, which
 * is the whole reason they read as floating rather than as a row of three
 * cards. That arrangement cannot survive a 350px column, so below `sm` they
 * return to normal flow.
 *
 * BUT NOT AS A COLUMN OF FULL-WIDTH BLOCKS. Three identical bars stacked down
 * the middle of a phone read as a list of items, which is the one thing these
 * are not: they are meant to look like pieces of an interface caught mid-air.
 * So each one takes about two thirds of the width and the three step across the
 * screen, left to centre to right, in the same order they sit in on a desktop.
 * The offsets are what carry the composition once the overlap is gone.
 *
 * The widths are percentages, so the three offsets hold their proportions from
 * a 320px phone upward instead of collapsing into a centred column. The caps
 * are what stop that working against itself: 74% of a 620px tablet is a 458px
 * card holding one customer name and one figure, which is a fragment stretched
 * into a banner. Capped near the sizes they take at `sm`, they keep their
 * proportions and the extra room goes into the offsets instead.
 */
function HeroFragments() {
  return (
    <div className="relative mx-auto mt-10 flex w-full max-w-4xl flex-col gap-2.5 sm:mt-12 sm:block sm:h-72 md:mt-14">
      {/* Left: an order, as it appears in the list. */}
      <Fragment
        index={0}
        className="mr-auto w-[74%] max-w-80 sm:absolute sm:top-10 sm:left-0 sm:mr-0 sm:w-76 md:left-2"
      >
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
        className="mx-auto w-[62%] max-w-68 sm:absolute sm:top-0 sm:left-1/2 sm:w-62 sm:-translate-x-1/2"
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
        className="ml-auto w-[74%] max-w-80 sm:absolute sm:top-28 sm:right-0 sm:ml-0 sm:w-68 md:right-2"
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
      className={`blur-rise rounded-xl border border-line bg-surface-raised/86 p-3.5 shadow-overlay backdrop-blur-md sm:p-4 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
