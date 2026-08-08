import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Design tokens",
  description: "Living reference for the token system Tally is built on.",
};

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
        <p className="text-label uppercase text-ink-faint">{eyebrow}</p>
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

function StatusPill({
  label,
  tint,
  line,
  ink,
}: {
  label: string;
  tint: string;
  line: string;
  ink: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-medium ${tint} ${line} ${ink}`}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */

export default function TokensPage() {
  return (
    <main className="mx-auto w-full max-w-content px-6 py-16 md:px-10 md:py-24">
      <header className="mb-16 max-w-prose">
        <p className="text-label uppercase text-ink-faint">Reference</p>
        <h1 className="mt-3 font-heading text-display-lg text-ink">
          Design tokens
        </h1>
        <p className="mt-4 text-body-lg text-ink-muted">
          Three tiers: primitives hold raw values, semantics name them by job,
          and the Tailwind bridge turns them into utilities. Components read
          only the middle tier, so the palette changes in one file.
        </p>
      </header>

      <Section
        eyebrow="Typography"
        title="Two families, one job each"
        note="Instrument Serif carries display sizes and nothing else. Inter takes every reading and interface size. The scale is deliberately small: body is 14px and section headings 17px, because a dense tool has no room for a 36px heading."
      >
        <div className="space-y-8">
          <div className="border-b border-line-subtle pb-6">
            <p className="mb-3 text-caption text-ink-faint">
              text-display-hero · Instrument Serif · clamp(2.125rem, 4.6vw,
              3.25rem)
            </p>
            <p className="font-heading text-display-hero text-ink">
              Know who owes you
            </p>
          </div>
          <div className="border-b border-line-subtle pb-6">
            <p className="mb-3 text-caption text-ink-faint">text-display-lg</p>
            <p className="font-heading text-display-lg text-ink">
              Record a payment
            </p>
          </div>
          <div className="border-b border-line-subtle pb-6">
            <p className="mb-3 text-caption text-ink-faint">text-display-sm</p>
            <p className="font-heading text-display-sm text-ink">
              Payment history
            </p>
          </div>
          <div className="border-b border-line-subtle pb-6">
            <p className="mb-3 text-caption text-ink-faint">
              text-body-lg · Inter
            </p>
            <p className="max-w-prose text-body-lg text-ink">
              Acme Corp has paid 400.00 of 1,000.00. The balance is due on 15
              August.
            </p>
          </div>
          <div className="border-b border-line-subtle pb-6">
            <p className="mb-3 text-caption text-ink-faint">text-body</p>
            <p className="max-w-prose text-body text-ink">
              Acme Corp has paid 400.00 of 1,000.00. The balance is due on 15
              August.
            </p>
          </div>
          <div className="border-b border-line-subtle pb-6">
            <p className="mb-3 text-caption text-ink-faint">
              text-body-sm · secondary ink
            </p>
            <p className="max-w-prose text-body-sm text-ink-muted">
              Acme Corp has paid 400.00 of 1,000.00. The balance is due on 15
              August.
            </p>
          </div>
          <div className="border-b border-line-subtle pb-6">
            <p className="mb-3 text-caption text-ink-faint">text-label</p>
            <p className="text-label uppercase text-ink-faint">Amount due</p>
          </div>
          <div>
            <p className="mb-3 text-caption text-ink-faint">
              text-metric-lg · tabular figures
            </p>
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
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Colour"
        title="Ink, surface, line"
        note="Elevation is tint plus a hairline, not shadow. Surfaces get fractionally darker as they recede, which is why cards read as separate without a single drop shadow."
      >
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          <Swatch name="bg-surface" className="bg-surface" bordered />
          <Swatch name="bg-surface-raised" className="bg-surface-raised" bordered />
          <Swatch name="bg-surface-sunken" className="bg-surface-sunken" bordered />
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
        eyebrow="Status"
        title="The only chroma in the system"
        note="Four states, each with a tint, a line and an ink so contrast is decided once. Low chroma on purpose: saturated status colours make a money screen look like a toy, and they stop reading as information."
      >
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill
            label="Pending"
            tint="bg-status-pending-tint"
            line="border-status-pending-line"
            ink="text-status-pending-ink"
          />
          <StatusPill
            label="Partially paid"
            tint="bg-status-partial-tint"
            line="border-status-partial-line"
            ink="text-status-partial-ink"
          />
          <StatusPill
            label="Paid"
            tint="bg-status-paid-tint"
            line="border-status-paid-line"
            ink="text-status-paid-ink"
          />
          <StatusPill
            label="Overdue"
            tint="bg-status-overdue-tint"
            line="border-status-overdue-line"
            ink="text-status-overdue-ink"
          />
        </div>
      </Section>

      <Section
        eyebrow="Radius"
        title="Five steps, not one value"
        note="A single radius applied everywhere flattens hierarchy and is a documented tell of generated design. Small controls sit tighter than the panels holding them."
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
                className={`size-20 border border-line bg-surface-sunken ${step.box}`}
              />
              <code className="text-caption text-ink-muted">{step.label}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Elevation"
        title="Two shadows, used sparingly"
        note="Layered rather than one blurred blob: a tight contact shadow plus a wider ambient one, which is how light actually falls. Reserved for things that genuinely float."
      >
        <div className="grid gap-6 sm:grid-cols-3">
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
              Dialogs and dropdowns only.
            </p>
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Motion"
        title="Press fast, release slow"
        note="Press registers in 100ms with a hard ease-out so acknowledgement feels instant. Release takes 160ms with a gentle overshoot so the control settles instead of snapping. Click and hold to feel the asymmetry."
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="pressable rounded-md bg-action px-4 py-2.5 text-body-sm font-medium text-action-ink transition-colors hover:bg-action-hover"
          >
            Record payment
          </button>
          <button
            type="button"
            className="pressable rounded-md border border-line bg-action-soft px-4 py-2.5 text-body-sm font-medium text-action-soft-ink transition-colors hover:bg-action-soft-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            className="pressable rounded-md px-4 py-2.5 text-body-sm font-medium text-action-ghost-ink transition-colors hover:bg-action-ghost-hover"
          >
            Back
          </button>
          <button
            type="button"
            className="pressable rounded-md bg-action-danger px-4 py-2.5 text-body-sm font-medium text-action-danger-ink transition-colors hover:bg-action-danger-hover"
          >
            Delete order
          </button>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {["Staggered", "entry", "animation"].map((word, i) => (
            <div
              key={word}
              style={{ "--stagger-index": i } as React.CSSProperties}
              className="rise-in rounded-lg border border-line bg-surface-raised p-6"
            >
              <p className="text-body-sm text-ink">{word}</p>
              <p className="mt-1 text-caption text-ink-faint">
                40ms apart, via --stagger-index
              </p>
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}
