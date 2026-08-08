import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { OrderForm } from "@/components/orders/order-form";
import { requireUser } from "@/server/auth/current-user";

export const metadata: Metadata = {
  title: "New order — Ledger",
};

export default async function NewOrderPage() {
  await requireUser();

  return (
    <main className="mx-auto w-full max-w-detail px-5 py-10 md:px-8 md:py-14">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-caption text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        All orders
      </Link>

      <h1 className="mt-5 font-heading text-display text-ink">New order</h1>
      <p className="mt-2 max-w-prose text-body-sm text-ink-muted">
        Record what the customer ordered. Payments are added afterwards, as and
        when the money arrives.
      </p>

      <div className="mt-9">
        <OrderForm />
      </div>
    </main>
  );
}
