"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiClientError, api } from "@/lib/api-client";
import { loginSchema, signupSchema } from "@/lib/schemas/auth";

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
 */
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isSignup = mode === "signup";
  const busy = submitting || isPending;

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

    setSubmitting(true);

    try {
      if (isSignup) {
        await api.signup(parsed.data);
      } else {
        await api.login(parsed.data);
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

  return (
    <main className="flex min-h-dvh flex-col">
      <div className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-form">
          <Link
            href="/"
            className="font-heading text-[1.0625rem] leading-none tracking-[-0.02em] text-ink transition-opacity duration-160 hover:opacity-60"
          >
            Folio
          </Link>

          <h1 className="mt-9 font-heading text-display text-ink">
            {isSignup ? "Start your ledger" : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-body-sm text-ink-muted">
            {isSignup
              ? "One account, and only you can see your orders."
              : "Sign in to see who owes you what."}
          </p>

          <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-3.5">
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
              hint={
                isSignup ? "At least 8 characters. Nothing else required." : undefined
              }
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

          <p className="mt-5 text-caption text-ink-muted">
            {isSignup ? "Already have an account? " : "No account yet? "}
            <Link
              href={isSignup ? "/login" : "/signup"}
              className="text-ink underline decoration-line underline-offset-4 hover:decoration-line-strong"
            >
              {isSignup ? "Sign in" : "Create one"}
            </Link>
          </p>

          {!isSignup ? (
            <div className="mt-7 rounded-md border border-line bg-surface-raised px-3.5 py-2.5">
              <p className="text-label uppercase text-ink-faint">Demo sign in</p>
              <p className="mt-1 font-mono text-caption text-ink">
                demo@folio.app
                <span className="mx-2 text-ink-disabled">/</span>
                demo1234
              </p>
            </div>
          ) : null}
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
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-label uppercase text-ink-faint">
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
        <p id={errorId} role="alert" className="text-caption text-feedback-error-ink">
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
