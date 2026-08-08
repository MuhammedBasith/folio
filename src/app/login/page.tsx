import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/server/auth/current-user";

export const metadata: Metadata = {
  title: "Sign in — Ledger",
};

export default async function LoginPage() {
  // Already signed in: send them where they were going rather than showing a
  // form that would immediately bounce them.
  if (await getCurrentUser()) {
    redirect("/orders");
  }

  return <AuthForm mode="login" />;
}
