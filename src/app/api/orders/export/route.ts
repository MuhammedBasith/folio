import { authedRoute, zodToApiError } from "@/server/api/handler";
import { listOrders } from "@/server/repositories/orders";
import { listOrdersQuerySchema } from "@/lib/schemas/order";
import { formatCents } from "@/lib/money";

/**
 * GET /api/orders/export?status=...&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * CSV export, one of the brief's stretch goals. Filtered by due date range and
 * optionally by status.
 *
 * Amounts are written as plain decimals with no currency symbol and no thousands
 * separators, because a spreadsheet has to parse them as numbers. That is the
 * one place formatted money is wrong.
 */
export const GET = authedRoute(async (request, { session }) => {
  const url = new URL(request.url);

  const parsed = listOrdersQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
  });

  if (!parsed.success) {
    throw zodToApiError(parsed.error);
  }

  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const orders = await listOrders(session.userId, {
    status: parsed.data.status,
  });

  // String comparison is correct for YYYY-MM-DD, which sorts lexicographically.
  const filtered = orders.filter((order) => {
    if (from && order.dueDate < from) return false;
    if (to && order.dueDate > to) return false;
    return true;
  });

  const header = [
    "reference",
    "customer",
    "due_date",
    "status",
    "total",
    "paid",
    "due",
    "payment_count",
  ];

  const rows = filtered.map((order) => [
    order.reference,
    order.customer,
    order.dueDate,
    order.status,
    formatCents(order.totalCents).replace(/,/g, ""),
    formatCents(order.paidCents).replace(/,/g, ""),
    formatCents(order.dueCents).replace(/,/g, ""),
    String(order.payments.length),
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");

  const filename = `orders-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
});

/**
 * Escapes a CSV field.
 *
 * A customer name containing a comma, a quote or a newline would otherwise
 * shift every following column. Quotes are doubled per RFC 4180.
 *
 * The leading apostrophe guards against CSV injection: a cell beginning with
 * =, +, - or @ is executed as a formula when the file is opened in Excel or
 * Sheets, and customer names are attacker-controlled free text.
 */
function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

  return /[",\n\r]/.test(guarded)
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
}
