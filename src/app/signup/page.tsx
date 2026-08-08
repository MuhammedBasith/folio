import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/server/auth/current-user";

export const metadata: Metadata = {
  title: "Create an account — Ledger",
};

export default async function SignupPage() {
  if (await getCurrentUser()) {
    redirect("/orders");
  }

  return <AuthForm mode="signup" />;
}
