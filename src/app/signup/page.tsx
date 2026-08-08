import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/server/auth/current-user";

/** Kept out of the index for the same reason as the sign in page. */
export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: false, follow: true },
};

export default async function SignupPage() {
  if (await getCurrentUser()) {
    redirect("/orders");
  }

  return <AuthForm mode="signup" />;
}
