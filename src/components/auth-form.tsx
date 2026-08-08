"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mark } from "@/components/brand/mark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ApiClientError, api } from "@/lib/api-client";
import { loginSchema, signupSchema } from "@/lib/schemas/auth";

const DEMO = { email: "demo@folio.app", password: "demo1234" };

/**
 * Sign in and sign up.
 *
 * One component for both, because the two forms differ only in their endpoint
 * and their copy. Splitting them would duplicate the error handling, which is
 * the only part with any substance.
 *
 * Errors land on the field that caused them. The API returns per-field messages
 * in `error.fields`, so "that email is already registered" appears under the
 * email input rather than as a banner the user has to map back to an input
 * themselves. Anything without a field lands in the form-level slot.
 *
 * THE DEMO IS A BUTTON, NOT A PAIR OF STRINGS TO COPY. Printing credentials and
 * expecting someone to retype them is a small, avoidable tax on the one action
 * this page most wants people to take.
 */
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isSignup = mode === "signup";
  const busy = submitting || isPending;

  async function authenticate(credentials: {
    email: string;
    password: string;
  }) {
    setSubmitting(true);

    try {
      if (isSignup) {
        await api.signup(credentials);
      } else {
        await api.login(credentials);
      }

      startTransition(() => {
        router.replace("/orders");
        // Without this the server layout keeps its cached "signed out" render
        // and the redirect bounces straight back to login.
        router.refresh();
      });
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFieldErrors(error.fields);
        if (Object.keys(error.fields).length === 0) {
          setFormError(error.message);
        }
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    const raw = {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    };

    // Client-side validation is a courtesy that saves a round trip. The server
    // runs the same schema and is the actual enforcement.
    const schema = isSignup ? signupSchema : loginSchema;
    const parsed = schema.safeParse(raw);

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "_");
        if (!(key in next)) next[key] = issue.message;
      }
      setFieldErrors(next);
      return;
    }

    await authenticate(parsed.data);
  }

  function signInAsDemo() {
    // Fill the visible fields as well as submitting, so the user can see what
    // was used. A button that logs you in with invisible credentials is a
    // magic trick, and magic tricks are hard to trust with money.
    const form = formRef.current;
    if (form) {
      (form.elements.namedItem("email") as HTMLInputElement).value = DEMO.email;
      (form.elements.namedItem("password") as HTMLInputElement).value =
        DEMO.password;
    }

    setFormError(null);
    setFieldErrors({});
    void authenticate(DEMO);
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ---- The form ---- */}
      <div className="flex flex-col px-5 py-6 sm:px-8 md:px-12">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 text-ink transition-opacity duration-160 hover:opacity-65"
          >
            <Mark className="size-4" />
            <span className="font-heading text-[1.0625rem] leading-none tracking-[-0.02em]">
              Folio
            </span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center py-10">
          <div className="w-full max-w-form">
            <h1 className="font-heading text-display-lg text-ink">
              {isSignup ? "Start your ledger" : "Welcome back"}
            </h1>
            <p className="mt-2 text-body-sm text-ink-muted">
              {isSignup
                ? "One account, and only you can see your orders."
                : "Sign in to see who owes you what."}
            </p>

            <form
              ref={formRef}
              onSubmit={handleSubmit}
              noValidate
              className="mt-8 space-y-4"
            >
              <Field
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                error={fieldErrors.email}
                autoFocus
              />

              <Field
                label="Password"
                name="password"
                type="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                placeholder={isSignup ? "At least 8 characters" : "Your password"}
                error={fieldErrors.password}
                hint={isSignup ? "At least 8 characters, nothing else." : undefined}
              />

              {formError ? (
                <p
                  role="alert"
                  className="rounded-md border border-feedback-error-line bg-feedback-error-tint px-3 py-2.5 text-caption text-feedback-error-ink"
                >
                  {formError}
                </p>
              ) : null}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy
                  ? isSignup
                    ? "Creating account"
                    : "Signing in"
                  : isSignup
                    ? "Create account"
                    : "Sign in"}
              </Button>
            </form>

            {!isSignup ? (
              <>
                <div className="my-5 flex items-center gap-3">
                  <span className="h-px flex-1 bg-line" />
                  <span className="text-caption text-ink-faint">or</span>
                  <span className="h-px flex-1 bg-line" />
                </div>

                <button
                  type="button"
                  onClick={signInAsDemo}
                  disabled={busy}
                  className="pressable group flex w-full items-center justify-between gap-3 rounded-md border border-line bg-surface-raised px-3.5 py-2.5 text-left transition-colors duration-160 ease-out-quint hover:border-line-strong/25 hover:bg-surface-sunken/60 disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                >
                  <span className="min-w-0">
                    <span className="block text-body-sm font-medium text-ink">
                      Look around with the demo account
                    </span>
                    <span className="mt-0.5 block truncate text-caption text-ink-faint">
                      {DEMO.email}
                    </span>
                  </span>
                  <ArrowRight
                    aria-hidden
                    className="size-3.5 shrink-0 text-ink-faint transition-transform duration-160 ease-out-quint group-hover:translate-x-0.5"
                  />
                </button>
              </>
            ) : null}

            <p className="mt-6 text-caption text-ink-muted">
              {isSignup ? "Already have an account? " : "No account yet? "}
              <Link
                href={isSignup ? "/login" : "/signup"}
                className="text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-line-strong"
              >
                {isSignup ? "Sign in" : "Create one"}
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/*
        ---- The panel ----

        Desktop only. On a phone it would be a decorative half-screen the user
        has to scroll past to reach the form, which is the wrong trade at the
        exact moment somebody is trying to sign in.

        The image is one of the gradient plates, cropped hard and carrying a
        single line. It is doing the job a stock photograph of a smiling team
        would otherwise be asked to do, without pretending to be evidence.
      */}
      <div className="relative hidden overflow-hidden p-3 lg:block">
        <div className="relative h-full w-full overflow-hidden rounded-xl">
          <Image
            src="/gradients/ember.webp"
            alt=""
            aria-hidden
            fill
            priority
            sizes="50vw"
            className="object-cover"
          />
          {/*
            Legibility scrim, bottom-up only, so the top of the plate stays
            clean and the type still has ground underneath it.

            Weighted for the WORST case rather than the average one. The lower
            half of this particular plate is pale grey, and at the opacity this
            started on the cream type sat on light grey and was genuinely hard
            to read. A scrim has to be built against the lightest pixel it might
            ever cover, not the one it happens to cover today.
          */}
          <div
            aria-hidden
            className="absolute inset-0 bg-linear-to-t from-[oklch(0.14_0.012_40/0.88)] from-15% via-[oklch(0.14_0.012_40/0.42)] via-45% to-transparent"
          />
          <div className="absolute inset-x-0 bottom-0 p-9">
            <p className="max-w-[22ch] font-heading text-display-lg text-[oklch(0.985_0.004_75)]">
              Every order, and exactly what is left on it.
            </p>
            <p className="mt-2.5 max-w-[38ch] text-body-sm text-[oklch(0.92_0.006_75/0.82)]">
              Totals come from the lines, balances come from the payments, and
              the arithmetic is exact to the cent.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * A labelled input with its error and hint.
 *
 * `aria-invalid` and `aria-describedby` are wired here rather than at each call
 * site, so the visual error state and what a screen reader announces are
 * produced by the same prop and cannot drift apart.
 */
function Field({
  label,
  name,
  error,
  hint,
  ...props
}: React.ComponentProps<typeof Input> & {
  label: string;
  name: string;
  error?: string;
  hint?: string;
}) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;

  return (
    <div className="space-y-2">
      <label
        htmlFor={name}
        className="block text-caption font-medium text-ink-muted"
      >
        {label}
      </label>
      <Input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        {...props}
      />
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-caption text-feedback-error-ink"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-caption text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
