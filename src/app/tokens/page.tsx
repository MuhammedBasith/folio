import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mark } from "@/components/brand/mark";
import { StatusBadge, StatusDot } from "@/components/status-badge";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ORDER_STATUSES } from "@/lib/domain/orders";
import { STATUS_LABELS } from "@/lib/format";

export const metadata: Metadata = {
  title: "Design tokens",
  description: "Living reference for the token system Folio is built on.",
};

/**
 * The token reference.
 *
 * A living page, not documentation: every swatch, control and animation on it is
 * the real component reading the real token, so it cannot describe a system the
 * product no longer has. The theme toggle in the header is the point of the
 * whole page. Flip it and watch every value below move together, because
 * nothing here holds a colour of its own.
 */

/* ------------------------------------------------------------------ */
/* Layout helpers, local to this page only                            */
/* ------------------------------------------------------------------ */

function Section({
  eyebrow,
  title,
  note,
  children,
}: {
  eyebrow: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line-subtle py-14 first:border-t-0 first:pt-0">
      <div className="mb-8 max-w-prose">
        <p className="text-caption text-ink-faint">{eyebrow}</p>
        <h2 className="mt-2 font-heading text-display-sm text-ink">{title}</h2>
        {note ? <p className="mt-3 text-body-sm text-ink-muted">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Swatch({
  name,
  className,
  bordered = false,
}: {
  name: string;
  className: string;
  bordered?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className={`h-16 rounded-md ${className} ${
          bordered ? "border border-line" : ""
        }`}
      />
      <code className="text-caption text-ink-muted">{name}</code>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function TokensPage() {
  return (
    <div className="min-h-dvh bg-surface-canvas">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 w-full max-w-content items-center justify-between px-6 md:px-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 text-ink transition-opacity duration-160 hover:opacity-65"
          >
            <Mark className="size-4" />
            <span className="font-heading text-[1.125rem] leading-none tracking-[-0.022em]">
              Folio
            </span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-content px-6 py-16 md:px-10 md:py-20">
        <div className="mb-16 max-w-prose">
          <p className="text-caption text-ink-faint">Reference</p>
          <h1 className="mt-3 font-heading text-display-lg text-ink">
            Design tokens
          </h1>
          <p className="mt-4 text-body-lg text-ink-muted">
            Three tiers: primitives hold raw values, semantics name them by job,
            and the Tailwind bridge turns them into utilities. Components read
            only the middle tier, which is why the toggle in the corner changes
            everything on this page and nothing in this page knows about it.
          </p>
        </div>

        <Section
          eyebrow="Typography"
          title="Two families, one job each"
          note="Instrument Serif carries display sizes and nothing else. Inter takes every reading and interface size. The scale is deliberately small: body is 14px and section headings 17px, because a dense tool has no room for a 36px heading."
        >
          <div className="space-y-8">
            <Specimen label="text-display-hero · Instrument Serif">
              <p className="font-heading text-display-hero text-ink">
                Know who owes you
              </p>
            </Specimen>
            <Specimen label="text-display-lg">
              <p className="font-heading text-display-lg text-ink">
                Record a payment
              </p>
            </Specimen>
            <Specimen label="text-display-sm">
              <p className="font-heading text-display-sm text-ink">
                Payment history
              </p>
            </Specimen>
            <Specimen label="text-body-lg · Inter">
              <p className="max-w-prose text-body-lg text-ink">
                Acme Corp has paid 400.00 of 1,000.00. The balance is due on 15
                August.
              </p>
            </Specimen>
            <Specimen label="text-body">
              <p className="max-w-prose text-body text-ink">
                Acme Corp has paid 400.00 of 1,000.00. The balance is due on 15
                August.
              </p>
            </Specimen>
            <Specimen label="text-body-sm · secondary ink">
              <p className="max-w-prose text-body-sm text-ink-muted">
                Acme Corp has paid 400.00 of 1,000.00. The balance is due on 15
                August.
              </p>
            </Specimen>
            <Specimen label="text-caption · the label size, sentence case">
              <p className="text-caption text-ink-faint">Amount due</p>
            </Specimen>
            <Specimen label="tabular-nums · what replaced the mono face">
              <div className="space-y-0.5 tabular-nums">
                <p className="text-body-sm text-ink">ORD-0001 · 4,556.00</p>
                <p className="text-body-sm text-ink">ORD-1111 · 1,111.11</p>
                <p className="mt-2 text-caption text-ink-faint">
                  Two families only. Inter carries references and figures with
                  tabular numerals, which is the one thing the monospace face
                  was actually providing.
                </p>
              </div>
            </Specimen>
            <Specimen label="text-metric-lg · tabular figures">
              <div className="space-y-1">
                <p data-numeric className="text-metric-lg text-ink">
                  1,000.00
                </p>
                <p data-numeric className="text-metric-lg text-ink">
                  111.11
                </p>
                <p className="mt-2 text-caption text-ink-faint">
                  Digits occupy identical width, so decimal points stack down a
                  column.
                </p>
              </div>
            </Specimen>
          </div>
        </Section>

        <Section
          eyebrow="Colour"
          title="Ink, surface, line"
          note="Elevation is tint plus a hairline, not shadow. Surfaces get fractionally darker as they recede in light mode and fractionally lighter in dark, because light travels up: an inversion that copies the light values exactly is the fastest way to make a dark theme look wrong without anyone being able to say why. `surface-inset` is the one that reverses direction on purpose, so a table header reads as a band on its panel rather than a hole punched in it."
        >
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-7">
            <Swatch name="bg-surface" className="bg-surface" bordered />
            <Swatch
              name="bg-surface-raised"
              className="bg-surface-raised"
              bordered
            />
            <Swatch
              name="bg-surface-sunken"
              className="bg-surface-sunken"
              bordered
            />
            <Swatch
              name="bg-surface-inset"
              className="bg-surface-inset"
              bordered
            />
            <Swatch
              name="bg-surface-canvas"
              className="bg-surface-canvas"
              bordered
            />
            <Swatch name="bg-surface-inverse" className="bg-surface-inverse" />
            <Swatch name="bg-action" className="bg-action" />
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-line bg-surface-raised p-5">
              <p className="text-ink">text-ink</p>
              <p className="mt-1 text-ink-muted">text-ink-muted</p>
              <p className="mt-1 text-ink-faint">text-ink-faint</p>
              <p className="mt-1 text-ink-disabled">text-ink-disabled</p>
            </div>
            <div className="rounded-lg border border-line-subtle bg-surface-raised p-5">
              <p className="text-body-sm text-ink-muted">border-line-subtle</p>
              <p className="mt-2 text-caption text-ink-faint">
                Dividers inside a bordered container.
              </p>
            </div>
            <div className="rounded-lg border border-line bg-surface-raised p-5">
              <p className="text-body-sm text-ink-muted">border-line</p>
              <p className="mt-2 text-caption text-ink-faint">
                The default component edge.
              </p>
            </div>
            <div className="rounded-lg border-2 border-line-strong bg-surface-raised p-5">
              <p className="text-body-sm text-ink">border-line-strong</p>
              <p className="mt-2 text-caption text-ink-faint">
                Selected state. Ink, never a colour.
              </p>
            </div>
          </div>
        </Section>

        <Section
          eyebrow="Brand"
          title="Colour lives on the editorial surface"
          note="Three hues, sampled from the gradient photographs rather than picked from a wheel, which is why they agree with the artwork and with each other. They appear on the landing page and nowhere inside the product: the accent on a money screen is ink, so the only chroma there is carrying information."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-wash-ember-line bg-wash-ember p-5">
              <p className="text-body-sm font-medium text-ink">Ember</p>
              <p className="mt-1 text-caption text-ink-muted">
                bg-wash-ember · the coral in signal and ember
              </p>
            </div>
            <div className="rounded-xl border border-wash-sage-line bg-wash-sage p-5">
              <p className="text-body-sm font-medium text-ink">Sage</p>
              <p className="mt-1 text-caption text-ink-muted">
                bg-wash-sage · the cool green in mist
              </p>
            </div>
            <div className="rounded-xl border border-wash-slate-line bg-wash-slate p-5">
              <p className="text-body-sm font-medium text-ink">Slate</p>
              <p className="mt-1 text-caption text-ink-muted">
                bg-wash-slate · the blue-grey haze in dusk
              </p>
            </div>
          </div>
        </Section>

        <Section
          eyebrow="Status"
          title="The only chroma inside the product"
          note="Four states, each with a tint, a line and an ink so contrast is decided once. Low chroma on purpose: saturated status colours make a money screen look like a toy, and they stop reading as information. The dot is the list weight; the pill is reserved for a screen where the status is the subject."
        >
          <div className="flex flex-wrap items-center gap-5">
            {ORDER_STATUSES.map((status) => (
              <div key={status} className="flex flex-col gap-2.5">
                <StatusBadge status={status} />
                <StatusDot status={status} />
                <code className="text-caption text-ink-disabled">
                  {STATUS_LABELS[status]}
                </code>
              </div>
            ))}
          </div>
        </Section>

        <Section
          eyebrow="Controls"
          title="Press fast, release slow"
          note="Press registers in 100ms with a hard ease-out so acknowledgement feels instant. Release takes 160ms with a gentle overshoot so the control settles instead of snapping. Click and hold one: the lit hairline along its top edge goes out as it drops, which is what a real key does when it falls below the plane of the light."
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button>Record payment</Button>
            <Button variant="secondary">Cancel</Button>
            <Button variant="ghost">Back</Button>
            <Button variant="danger">Delete order</Button>
          </div>

          <div className="mt-6 flex flex-wrap items-end gap-3">
            <Button size="xs">xs</Button>
            <Button size="sm">sm</Button>
            <Button size="md">md</Button>
            <Button size="lg">lg</Button>
            <Button disabled>disabled</Button>
          </div>

          <div className="mt-8 grid max-w-md gap-4">
            <div className="space-y-2">
              <label
                htmlFor="demo-input"
                className="block text-caption font-medium text-ink-muted"
              >
                Input
              </label>
              <Input id="demo-input" placeholder="Recessed, not raised" />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="demo-invalid"
                className="block text-caption font-medium text-ink-muted"
              >
                Invalid
              </label>
              <Input id="demo-invalid" aria-invalid defaultValue="1,50" />
              <p className="text-caption text-feedback-error-ink">
                Use a full stop for decimals.
              </p>
            </div>
          </div>
        </Section>

        <Section
          eyebrow="Radius"
          title="Five steps, not one value"
          note="A single radius applied everywhere flattens hierarchy and is a documented tell of generated design. Small controls sit tighter than the panels holding them. The nesting rule: inner radius equals outer radius minus the gap between them."
        >
          {/* Written out rather than interpolated: Tailwind extracts class names
              statically, so `rounded-${step}` would compile to nothing. */}
          <div className="flex flex-wrap gap-5">
            {[
              { label: "rounded-xs", box: "rounded-xs" },
              { label: "rounded-sm", box: "rounded-sm" },
              { label: "rounded-md", box: "rounded-md" },
              { label: "rounded-lg", box: "rounded-lg" },
              { label: "rounded-xl", box: "rounded-xl" },
            ].map((step) => (
              <div key={step.label} className="flex flex-col gap-2">
                <div
                  className={`size-20 border border-line bg-surface-raised ${step.box}`}
                />
                <code className="text-caption text-ink-muted">
                  {step.label}
                </code>
              </div>
            ))}
          </div>
        </Section>

        <Section
          eyebrow="Elevation"
          title="Two shadows and one hairline"
          note="Shadows are layered rather than one blurred blob: a tight contact shadow plus a wider ambient one, which is how light actually falls. Reserved for things that genuinely float. The relief is separate, an inset highlight in the inset-shadow namespace so it composes with a drop shadow instead of replacing it."
        >
          <div className="grid gap-6 sm:grid-cols-4">
            <div className="rounded-lg border border-line bg-surface-raised p-6">
              <p className="text-body-sm text-ink">No shadow</p>
              <p className="mt-1 text-caption text-ink-faint">
                Cards, panels, table containers.
              </p>
            </div>
            <div className="rounded-lg border border-line bg-surface-raised p-6 shadow-raised">
              <p className="text-body-sm text-ink">shadow-raised</p>
              <p className="mt-1 text-caption text-ink-faint">
                Hover lift on an interactive card.
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface-overlay p-6 shadow-overlay">
              <p className="text-body-sm text-ink">shadow-overlay</p>
              <p className="mt-1 text-caption text-ink-faint">
                Dialogs and popovers only.
              </p>
            </div>
            <div className="rounded-lg border border-line bg-action p-6 inset-shadow-relief">
              <p className="text-body-sm text-action-ink">inset-shadow-relief</p>
              <p className="mt-1 text-caption text-action-ink/70">
                One lit pixel along the top edge.
              </p>
            </div>
          </div>
        </Section>

        <Section
          eyebrow="Motion"
          title="Entrances, staggered"
          note="Movement is transform and opacity only, so nothing here touches layout. Reduced motion removes the movement and keeps the fade, because the fade is the part carrying meaning: it is how the interface says this is new."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            {["Staggered", "entry", "animation"].map((word, index) => (
              <div
                key={word}
                style={{ "--stagger-index": index } as React.CSSProperties}
                className="rise-in rounded-lg border border-line bg-surface-raised p-6"
              >
                <p className="text-body-sm text-ink">{word}</p>
                <p className="mt-1 text-caption text-ink-faint">
                  40ms apart, via --stagger-index
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {["Editorial", "blur", "rise"].map((word, index) => (
              <div
                key={word}
                style={{ "--stagger-index": index } as React.CSSProperties}
                className="blur-rise rounded-lg border border-line bg-surface-raised p-6"
              >
                <p className="text-body-sm text-ink">{word}</p>
                <p className="mt-1 text-caption text-ink-faint">
                  900ms, landing on filter: none
                </p>
              </div>
            ))}
          </div>
        </Section>

        <Section
          eyebrow="Texture"
          title="Grain, on everything"
          note="A fixed fractal-noise tile at 5.5% opacity, multiplying on paper and screening on charcoal. It is on this page right now. Zoom in on any flat area and it is visible; at reading distance it is the difference between a printed surface and a screenshot of a colour picker."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-32 rounded-lg bg-wash-ember" />
            <div className="h-32 rounded-lg bg-surface-inverse" />
          </div>
        </Section>
      </main>
    </div>
  );
}

function Specimen({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-line-subtle pb-6 last:border-b-0 last:pb-0">
      <p className="mb-3 text-caption text-ink-faint">{label}</p>
      {children}
    </div>
  );
}
