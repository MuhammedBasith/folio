import { authedRoute, zodToApiError } from "@/server/api/handler";
import { ApiError } from "@/server/api/errors";
import { listOrders } from "@/server/repositories/orders";
import { exportRangeSchema, listOrdersQuerySchema } from "@/lib/schemas/order";
import { formatCents } from "@/lib/money";

/**
 * GET /api/orders/export?status=...&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * CSV export, filtered by due date range and optionally by status.
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

  /**
   * `from` and `to` are validated, not trusted.
   *
   * They were previously read raw and compared lexicographically against
   * `dueDate`. A malformed value like `?from=08-2026` is a perfectly valid
   * string that sorts above every real date, so the export returned an empty
   * but entirely successful CSV. Someone reconciling their books would conclude
   * they had no orders in that period rather than that they had mistyped.
   *
   * A bad range is now a 422 naming the offending parameter.
   */
  const range = exportRangeSchema.safeParse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });

  if (!range.success) {
    throw zodToApiError(range.error);
  }

  const { from, to } = range.data;

  if (from && to && from > to) {
    throw new ApiError({
      status: 422,
      code: "VALIDATION_FAILED",
      message: "The start of the range must not be after the end.",
      fields: { from: "This date is after the end of the range." },
    });
  }

  const orders = await listOrders(session.userId, {
    status: parsed.data.status,
  });

  // String comparison is correct for YYYY-MM-DD, which sorts lexicographically,
  // and both sides are now guaranteed to be in that format.
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
