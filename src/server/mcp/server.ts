import { ZodError, z } from "zod";
import { createMcpHandler } from "mcp-handler";
import { ApiError, insufficientScope } from "@/server/api/errors";
import { type Principal, zodToApiError } from "@/server/api/handler";
import { WRITE_LIMIT, hit } from "@/server/api/rate-limit";
import {
  createOrder,
  getOrderByIdOrReference,
  listOrders,
} from "@/server/repositories/orders";
import { recordPayment } from "@/server/repositories/payments";
import {
  ORDER_STATUSES,
  buildAgeingReport,
  compareByUrgency,
  daysOverdue,
  toUtcDateKey,
} from "@/lib/domain/orders";
import { buildChaseMessage } from "@/lib/domain/chase";
import { formatMoney, sumCents } from "@/lib/money";
import { createOrderSchema, recordPaymentSchema } from "@/lib/schemas/order";

/**
 * The MCP server.
 *
 * WHAT THIS IS. A second consumer of the same repositories the REST API and the
 * dashboard use, exposed in the shape an agent expects. It reimplements no
 * rule: money is still summed by `src/lib/money.ts`, status is still derived by
 * `src/lib/domain/orders.ts`, and a payment still goes through the row lock in
 * the payment repository. If the arithmetic is right on the dashboard it is
 * right here, because it is the same arithmetic.
 *
 * THE HANDLER IS BUILT PER REQUEST, CLOSING OVER ONE PRINCIPAL, AND THAT IS THE
 * TENANT ISOLATION GUARANTEE. The alternative, a module-level server that reads
 * "the current user" from somewhere mutable, is the single worst bug this file
 * could contain: under concurrency two requests would race on that value and
 * one account would be handed another's ledger. Capturing `principal` in a
 * closure created for this request makes that structurally impossible rather
 * than merely unlikely. Construction allocates objects and performs no I/O, so
 * the cost is nil.
 *
 * WHAT IS DELIBERATELY ABSENT: there is no `update_order` and no `delete_order`,
 * although the REST API has both. An agent acting on a sentence like "clear out
 * the old orders" should not be able to destroy the record of money that was
 * received; the whole product exists to keep that record. The MCP surface is
 * therefore append-only by construction, and anything destructive stays behind
 * a human pressing a button in the UI. This is a narrower surface than the API
 * key technically permits, which is the correct direction to err.
 */

/**
 * How many orders a list returns before it starts holding some back.
 *
 * Fifty is well past what anybody asks about in one breath and small enough
 * that the response stays cheap. The ceiling exists so a caller cannot ask for
 * a hundred thousand rows and turn one tool call into an outage.
 */
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 500;

/** Compact projection for lists, so a long ledger does not flood the context. */
function summarise(
  order: Awaited<ReturnType<typeof listOrders>>[number],
  asOf: Date,
) {
  const late = daysOverdue(order.dueDate, asOf);

  return {
    id: order.id,
    reference: order.reference,
    customer: order.customer,
    status: order.status,
    dueDate: order.dueDate,
    /**
     * Cents AND a formatted string, both.
     *
     * The integer is what a caller does arithmetic on; the string is what stops
     * a model reporting "you are owed 736800" to somebody who asked a question
     * about dollars. Sending only one of them guarantees one of those two
     * failures.
     */
    totalCents: order.totalCents,
    total: formatMoney(order.totalCents),
    paidCents: order.paidCents,
    paid: formatMoney(order.paidCents),
    dueCents: order.dueCents,
    due: formatMoney(order.dueCents),
    daysOverdue: late > 0 ? late : 0,
  };
}

/** Every tool answers with pretty JSON, which models read reliably. */
function reply(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

/**
 * Turns a thrown value into a tool error the agent can act on.
 *
 * `ApiError` messages are written for humans and already say what to do next
 * ("the most you can record for this order is $600.00"), which is exactly what
 * a model needs to correct itself and retry. Anything else is a bug: logged in
 * full server-side, reported as an opaque failure, so no internal detail
 * reaches the model or, through it, the transcript.
 */
function toToolError(error: unknown) {
  /**
   * A schema rejection is a 422 the caller can act on, not a server fault.
   *
   * Routed through the same `zodToApiError` the REST API uses, so a model gets
   * the identical per-field message a form would, rather than the opaque
   * "something went wrong" that an unrecognised throw produces. Without this,
   * the canonical re-validation below would tell an agent nothing it could use
   * to correct itself.
   */
  if (error instanceof ZodError) {
    return toToolError(zodToApiError(error));
  }

  if (error instanceof ApiError) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              error: {
                code: error.code,
                message: error.message,
                /**
                 * `fields` and `details` both carried through, because they are
                 * the half a caller can act on: which input was wrong, and the
                 * number that would have been accepted. Dropping them leaves a
                 * model with "some of the details need fixing" and no way to
                 * work out which, so it guesses, and guessing at a payment
                 * amount is precisely what should not happen here.
                 */
                ...(error.fields ? { fields: error.fields } : {}),
                ...(error.details ? { details: error.details } : {}),
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  console.error("[mcp] unhandled tool error", error);

  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error: {
            code: "INTERNAL_ERROR",
            message: "Something went wrong on our end.",
          },
        }),
      },
    ],
  };
}

/** Wraps a tool body so no handler can forget the error envelope. */
async function tool<T>(run: () => Promise<T>) {
  try {
    return reply(await run());
  } catch (error) {
    return toToolError(error);
  }
}

/**
 * Guards every write tool.
 *
 * REDUNDANT WITH THE CONDITIONAL REGISTRATION BELOW, ON PURPOSE. Write tools
 * are not registered at all for a read-only key, so a well-behaved client never
 * reaches this. That protection lives in one `if` at the bottom of this file,
 * and an `if` is exactly the kind of thing a later refactor moves. This check
 * costs a property comparison and means the guarantee survives that refactor.
 */
function assertCanWrite(principal: Principal): void {
  if (principal.scope !== "READ_WRITE") {
    throw insufficientScope();
  }
}

/**
 * Charges a write against the same budget the REST API uses.
 *
 * MCP arrives as a single POST carrying JSON-RPC, so the method-based
 * classification in `authedRoute` cannot see the difference between reading a
 * balance and recording a payment. Counting it here keeps one runaway agent
 * from writing without limit through a door the REST API keeps shut, and keys
 * the bucket the same way, so an agent and a curl loop share one allowance
 * rather than getting one each.
 */
function chargeWrite(principal: Principal): void {
  const result = hit(`write:${principal.apiKeyId ?? principal.userId}`, WRITE_LIMIT);

  if (!result.ok) {
    throw new ApiError({
      status: 429,
      code: "RATE_LIMITED",
      message: "That is a lot of changes at once. Give it a moment.",
      details: { retryAfterSeconds: result.retryAfter },
    });
  }
}

const orderIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .describe(
    'The order reference as shown in the app, such as "ORD-0007", or its id.',
  );

export function createFolioMcpHandler(principal: Principal) {
  return createMcpHandler(
    (server) => {
      /* ---------------- Reads ---------------- */

      server.registerTool(
        "list_orders",
        {
          title: "List orders",
          description:
            "List this account's orders with totals, balances and derived status. Use this to answer questions like who owes money, how much is outstanding, or what is overdue. Returns a summary of totals alongside the orders.",
          inputSchema: z.object({
            status: z
              .enum([...ORDER_STATUSES, "all"])
              .optional()
              .describe(
                "Filter by status. Omit or pass 'all' for every order. 'overdue' means past its due date and not settled.",
              ),
            limit: z
              .number()
              .int()
              .min(1)
              .max(MAX_LIST_LIMIT)
              .optional()
              .describe(
                `How many orders to return, most urgent first. Defaults to ${DEFAULT_LIST_LIMIT}. Totals always cover every matching order, not just the ones returned.`,
              ),
          }),
          // Advertised to the client so it knows this cannot change anything.
          annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async ({ status, limit }) =>
          tool(async () => {
            const asOf = new Date();

            const orders = await listOrders(
              principal.userId,
              status && status !== "all" ? { status } : {},
              asOf,
            );

            /**
             * TOTALS OVER EVERYTHING, ROWS BOUNDED.
             *
             * A ledger with two thousand orders would otherwise return two
             * thousand objects into a model's context window, which is both
             * expensive and worse at answering the question. Truncating the
             * rows while summing over the full set means "how much am I owed"
             * stays exactly right no matter how many rows come back, which is
             * the failure mode that would actually matter: a total that
             * silently describes only the first page is a wrong answer
             * delivered confidently.
             */
            const outstandingCents = sumCents(orders.map((o) => o.dueCents));
            const overdueCents = sumCents(
              orders.filter((o) => o.status === "overdue").map((o) => o.dueCents),
            );

            /**
             * Sorted by urgency before truncating, so what survives the cut is
             * what somebody chasing money would look at first: longest overdue,
             * then live, then settled. Truncating the repository's due-date
             * order would drop the oldest debts, which are the whole point.
             */
            const ranked = [...orders].sort(compareByUrgency);
            const cap = limit ?? DEFAULT_LIST_LIMIT;
            const shown = ranked.slice(0, cap);

            return {
              asOf: toUtcDateKey(asOf),
              orderCount: orders.length,
              returned: shown.length,
              omitted: orders.length - shown.length,
              outstandingCents,
              outstanding: formatMoney(outstandingCents),
              overdueCents,
              overdue: formatMoney(overdueCents),
              ...(orders.length > shown.length
                ? {
                    note: `Showing the ${shown.length} most urgent of ${orders.length} orders. The totals above cover all ${orders.length}. Raise 'limit' for more.`,
                  }
                : {}),
              orders: shown.map((order) => summarise(order, asOf)),
            };
          }),
      );

      server.registerTool(
        "get_order",
        {
          title: "Get one order",
          description:
            "Full detail for a single order, including every line item and the complete payment history.",
          inputSchema: z.object({ order: orderIdentifierSchema }),
          annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async ({ order }) =>
          tool(async () => {
            const asOf = new Date();
            const found = await getOrderByIdOrReference(
              principal.userId,
              order,
              asOf,
            );

            return {
              ...found,
              total: formatMoney(found.totalCents),
              paid: formatMoney(found.paidCents),
              due: formatMoney(found.dueCents),
              daysOverdue: Math.max(0, daysOverdue(found.dueDate, asOf)),
            };
          }),
      );

      server.registerTool(
        "ageing_report",
        {
          title: "Debtor ageing report",
          description:
            "Bucket everything still owed by how far past its due date it is, on the conventional boundaries (not yet due, 1-30, 31-60, 61-90, over 90 days). Use this to answer which debts are worth chasing first.",
          annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async () =>
          tool(async () => {
            const asOf = new Date();
            const orders = await listOrders(principal.userId, {}, asOf);
            const report = buildAgeingReport(orders, asOf);

            return {
              asOf: toUtcDateKey(asOf),
              totalCents: report.totalCents,
              total: formatMoney(report.totalCents),
              overdueCents: report.overdueCents,
              overdue: formatMoney(report.overdueCents),
              buckets: report.buckets.map((bucket) => ({
                ...bucket,
                amount: formatMoney(bucket.cents),
              })),
            };
          }),
      );

      server.registerTool(
        "draft_chase_message",
        {
          title: "Draft a chase message",
          description:
            "Draft the email chasing payment on an order. The tone escalates with how late the money is, on the same thresholds as the ageing report. This only drafts text: nothing is sent, and this application has no mail transport.",
          inputSchema: z.object({
            order: orderIdentifierSchema,
            senderName: z
              .string()
              .trim()
              .max(120)
              .optional()
              .describe("Name to sign the message off with."),
          }),
          annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async ({ order, senderName }) =>
          tool(async () => {
            const asOf = new Date();
            const found = await getOrderByIdOrReference(
              principal.userId,
              order,
              asOf,
            );

            return buildChaseMessage({
              reference: found.reference,
              customer: found.customer,
              dueDate: found.dueDate,
              totalCents: found.totalCents,
              paidCents: found.paidCents,
              dueCents: found.dueCents,
              status: found.status,
              asOf,
              senderName,
            });
          }),
      );

      /* ---------------- Writes ---------------- */

      /**
       * Registered ONLY for a read-write key, so a read-only key does not even
       * see that these exist. That is better than refusing them at call time:
       * a model cannot be tempted by a tool it was never shown, and cannot
       * waste a turn discovering it is not allowed.
       */
      if (principal.scope !== "READ_WRITE") return;

      server.registerTool(
        "record_payment",
        {
          title: "Record a payment",
          description:
            "Record that money arrived against an order. This writes to the ledger. Amounts are INTEGER CENTS: $500.00 is 50000. A payment may not exceed the outstanding balance; if it does, the error states the maximum that would be accepted.",
          inputSchema: z.object({
            order: orderIdentifierSchema,
            amountCents: recordPaymentSchema.shape.amountCents.describe(
              "Amount in integer cents. $500.00 is 50000.",
            ),
            paidOn: recordPaymentSchema.shape.paidOn
              .optional()
              .describe("Date received, YYYY-MM-DD. Defaults to today."),
            note: recordPaymentSchema.shape.note.describe(
              "Optional note, such as a bank reference.",
            ),
          }),
          annotations: {
            readOnlyHint: false,
            // Recording a payment adds a row; it never removes or overwrites
            // one. Telling the client that lets it decide how much ceremony to
            // put in front of the call.
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
        async ({ order, amountCents, paidOn, note }) =>
          tool(async () => {
            assertCanWrite(principal);
            chargeWrite(principal);

            const asOf = new Date();
            const found = await getOrderByIdOrReference(
              principal.userId,
              order,
              asOf,
            );

            /**
             * Parsed with the canonical schema for the same reason
             * `create_order` is: the advertised shape is assembled from
             * individual fields, so anything the schema asserts about the
             * OBJECT rather than about one field would otherwise be lost here.
             * `recordPaymentSchema` has no such rule today. Routing through it
             * anyway means that if one is ever added, this path gets it for
             * free instead of quietly not.
             */
            const validated = recordPaymentSchema.parse({
              amountCents,
              // UTC today, matching how every other date in this system is
              // reduced. A local "today" would record a payment against
              // yesterday for anybody west of Greenwich.
              paidOn: paidOn ?? toUtcDateKey(asOf),
              note,
            });

            const result = await recordPayment(
              principal.userId,
              found.id,
              validated,
              asOf,
            );

            return {
              recorded: {
                amountCents: validated.amountCents,
                amount: formatMoney(validated.amountCents),
                paidOn: validated.paidOn,
              },
              order: summarise(result.order, asOf),
            };
          }),
      );

      server.registerTool(
        "create_order",
        {
          title: "Create an order",
          description:
            "Create a new order with its line items. The total is computed from the lines and is never accepted directly. Amounts are INTEGER CENTS: $500.00 is 50000. The reference (ORD-0001, ORD-0002, ...) is assigned automatically.",
          inputSchema: z.object({
            customer: createOrderSchema.shape.customer,
            dueDate: createOrderSchema.shape.dueDate.describe(
              "When payment is due, YYYY-MM-DD.",
            ),
            lineItems: createOrderSchema.shape.lineItems.describe(
              "At least one line. Unit prices are in integer cents.",
            ),
            notes: createOrderSchema.shape.notes,
          }),
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
        async (input) =>
          tool(async () => {
            assertCanWrite(principal);
            chargeWrite(principal);

            /**
             * RE-VALIDATED AGAINST THE CANONICAL SCHEMA, AND THIS LINE IS NOT
             * BELT AND BRACES. IT IS LOAD-BEARING.
             *
             * The `inputSchema` above is assembled field by field out of
             * `createOrderSchema.shape.*`, because each field then carries a
             * description a model can read. Doing that silently drops the
             * OBJECT-LEVEL `.refine()` on `createOrderSchema`, which is the
             * check that caps the aggregate order total.
             *
             * That cap is not cosmetic. Every field can be inside its own limit
             * while the product of them is not: 100 lines x 100,000 quantity x
             * $9,999,999.99 exceeds `Number.MAX_SAFE_INTEGER`.
             * `calculateOrderTotalCents` then correctly refuses to return a
             * lossy number and throws, but by then the row is committed, so
             * every subsequent read of that order AND of the list containing it
             * throws too. One accepted tool call makes the entire account
             * permanently unreadable.
             *
             * Found by writing exactly that request against this endpoint and
             * watching a test account stop being able to list its own orders.
             * Parsing with the whole schema here means the MCP path enforces
             * precisely the rules the REST path does, with no second copy of
             * them to keep in step.
             */
            const validated = createOrderSchema.parse(input);

            const asOf = new Date();
            const created = await createOrder(
              principal.userId,
              validated,
              asOf,
            );

            return summarise(created, asOf);
          }),
      );
    },
    {
      serverInfo: { name: "folio", version: "1.0.0" },
      instructions:
        "Folio is a private receivables ledger: orders owed to the account holder, and the payments that settle them. All money is integer cents. Customers are names on orders, not users, and nothing here sends email or moves money.",
    },
  );
}
