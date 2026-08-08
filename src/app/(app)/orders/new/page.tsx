import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { OrderForm } from "@/components/orders/order-form";
import { requireUser } from "@/server/auth/current-user";

export const metadata: Metadata = {
  title: "New order",
};

export default async function NewOrderPage() {
  await requireUser();

  return (
    <main className="mx-auto w-full max-w-detail px-5 py-8 md:px-8 md:py-10">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-caption text-ink-faint transition-colors duration-160 hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-3" />
        Orders
      </Link>

      <h1 className="mt-4 font-heading text-display text-ink">New order</h1>
      <p className="mt-1 text-body-sm text-ink-muted">
        Record what the customer ordered. Payments are added afterwards, as and
        when the money arrives.
      </p>

      <div className="mt-8">
        <OrderForm />
      </div>
    </main>
  );
}
