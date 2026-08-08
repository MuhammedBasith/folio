import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/client";
import { notFound, orderLocked } from "@/server/api/errors";
import {
  type OrderStatus,
  isOrderEditable,
  summariseOrder,
} from "@/lib/domain/orders";
import type { CreateOrderInput, UpdateOrderInput } from "@/lib/schemas/order";
import { lockOrderForWrite } from "./lock";

/**
 * Order persistence.
 *
 * TENANT ISOLATION: every function takes `ownerId` and every query filters on
 * it. There is no code path that reads an order by id alone, so "forgot the
 * where clause" is not a mistake that can be made here. A row belonging to
 * another user is reported as 404, not 403, so the API never confirms that
 * someone else's order exists.
 *
 * DERIVED VALUES: totals and status are computed on read by the domain layer,
 * never stored. See the note in `src/lib/domain/orders.ts` for why.
 */

const ORDER_INCLUDE = {
  lineItems: { orderBy: { position: "asc" } },
  payments: { orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }] },
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

export interface OrderDto {
  id: string;
  reference: string;
  customer: string;
  dueDate: string;
  notes: string | null;
  status: OrderStatus;
  totalCents: number;
  paidCents: number;
  dueCents: number;
  editable: boolean;
  createdAt: string;
  lineItems: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }>;
  payments: Array<{
    id: string;
    amountCents: number;
    paidOn: string;
    note: string | null;
    createdAt: string;
  }>;
}

/** Maps a row to the API shape, applying the domain rules exactly once. */
export function toOrderDto(order: OrderRow, asOf: Date): OrderDto {
  const summary = summariseOrder(
    order.lineItems,
    order.payments,
    order.dueDate,
    asOf,
  );

  return {
    id: order.id,
    reference: order.reference,
    customer: order.customer,
    dueDate: order.dueDate.toISOString().slice(0, 10),
    notes: order.notes,
    status: summary.status,
    totalCents: summary.totalCents,
    paidCents: summary.paidCents,
    dueCents: summary.dueCents,
    editable: isOrderEditable(order.payments.length),
    createdAt: order.createdAt.toISOString(),
    lineItems: order.lineItems.map((line) => ({
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      lineTotalCents: line.quantity * line.unitPriceCents,
    })),
    payments: order.payments.map((payment) => ({
      id: payment.id,
      amountCents: payment.amountCents,
      paidOn: payment.paidOn.toISOString().slice(0, 10),
      note: payment.note,
      createdAt: payment.createdAt.toISOString(),
    })),
  };
}

/** Parses "YYYY-MM-DD" into the midnight-UTC Date a SQL DATE column expects. */
export function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/**
 * Lists a user's orders, optionally filtered by status.
 *
 * The status filter is applied in application code rather than in SQL, because
 * status is derived and three of the four states depend on summing child rows
 * against the current date. Expressing that as a WHERE clause would mean either
 * a denormalised column that goes stale, or a correlated subquery per row.
 *
 * At the scale this product implies (one owner's orders) the difference is not
 * measurable. The README documents what would change at scale: a materialised
 * `paid_cents` maintained transactionally alongside payment inserts, leaving
 * only `overdue` to be derived, which is then a plain indexed date predicate.
 */
export async function listOrders(
  ownerId: string,
  options: { status?: OrderStatus } = {},
  asOf: Date = new Date(),
): Promise<OrderDto[]> {
  const orders = await prisma.order.findMany({
    where: { ownerId },
    include: ORDER_INCLUDE,
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });

  const dtos = orders.map((order) => toOrderDto(order, asOf));

  return options.status
    ? dtos.filter((order) => order.status === options.status)
    : dtos;
}

export async function getOrder(
  ownerId: string,
  orderId: string,
  asOf: Date = new Date(),
): Promise<OrderDto> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, ownerId },
    include: ORDER_INCLUDE,
  });

  if (!order) {
    throw notFound("order");
  }

  return toOrderDto(order, asOf);
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

const REFERENCE_PREFIX = "ORD-";
const MAX_REFERENCE_ATTEMPTS = 5;

/**
 * Builds the next per-user reference.
 *
 * Derived from the highest existing number rather than from a row count, so
 * deleting an order does not cause the next one to reuse a retired reference.
 *
 * SORTED NUMERICALLY, NOT AS TEXT. `ORDER BY reference DESC` looks correct and
 * is correct for exactly 9,999 orders, then breaks permanently: as text
 * "ORD-9999" sorts above "ORD-10000", so once a user passes four digits the
 * highest reference stops being found, every create derives 10000 again, and
 * the unique constraint rejects all five attempts. The account can no longer
 * create orders at all.
 *
 * The cast is safe because the suffix is generated by this function and the
 * column is constrained to values it produced.
 */
async function nextReference(ownerId: string): Promise<string> {
  /**
   * `::int` on the offset is load-bearing, not decoration.
   *
   * Prisma binds an untyped number as text, and `SUBSTRING(string FROM text)`
   * resolves to the POSIX REGEX overload rather than the positional one. It
   * then tries to match the pattern "5" against "ORD-9999", finds nothing, and
   * returns NULL. `MAX(NULL)` is NULL, the next reference silently resets to
   * ORD-0001, and every create collides with an existing row.
   *
   * The cast forces the positional overload. Caught by the numbering tests,
   * which is exactly why they assert the value rather than only that it did not
   * throw.
   */
  const offset = REFERENCE_PREFIX.length + 1;

  const rows = await prisma.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(CAST(SUBSTRING("reference" FROM ${offset}::int) AS INTEGER)) AS max
    FROM "orders"
    WHERE "ownerId" = ${ownerId}
      AND "reference" ~ ${`^${REFERENCE_PREFIX}[0-9]+$`}
  `;

  const current = rows[0]?.max ?? 0;
  const next = Number.isSafeInteger(current) ? current + 1 : 1;

  // padStart only pads; a five-digit number keeps all five digits.
  return `${REFERENCE_PREFIX}${String(next).padStart(4, "0")}`;
}

/**
 * Creates an order and its lines in one transaction.
 *
 * Reference allocation races: two concurrent creates for the same user can read
 * the same "latest" and derive the same next value. Rather than serialising
 * every create behind a lock for a cosmetic field, the unique constraint on
 * (ownerId, reference) is allowed to reject the loser and the write is retried.
 * Contention is near zero in practice, and correctness is guaranteed by the
 * database rather than by hope.
 */
export async function createOrder(
  ownerId: string,
  input: CreateOrderInput,
  asOf: Date = new Date(),
): Promise<OrderDto> {
  for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt += 1) {
    const reference = await nextReference(ownerId);

    try {
      const order = await prisma.order.create({
        data: {
          ownerId,
          reference,
          customer: input.customer,
          dueDate: toDateOnly(input.dueDate),
          notes: input.notes ?? null,
          lineItems: {
            create: input.lineItems.map((line, index) => ({
              description: line.description,
              quantity: line.quantity,
              unitPriceCents: line.unitPriceCents,
              position: index,
            })),
          },
        },
        include: ORDER_INCLUDE,
      });

      return toOrderDto(order, asOf);
    } catch (error) {
      if (isUniqueViolation(error) && attempt < MAX_REFERENCE_ATTEMPTS - 1) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Could not allocate an order reference after several tries.");
}

/**
 * Replaces an order's details and lines.
 *
 * Rejected outright once any payment exists. See `isOrderEditable` for why
 * freezing beats validating: allowing edits means a total can be pushed below
 * what has already been collected, and the guard against that has to be
 * re-derived on every write path.
 *
 * Lines are replaced wholesale rather than diffed. The client sends the full
 * intended list, so a delete-then-insert inside one transaction is both simpler
 * and free of partial-update states.
 */
export async function updateOrder(
  ownerId: string,
  orderId: string,
  input: UpdateOrderInput,
  asOf: Date = new Date(),
): Promise<OrderDto> {
  return prisma.$transaction(async (tx) => {
    // MUST come before the editability check. Without it the count below is a
    // snapshot read that cannot see an in-flight payment, and this update can
    // cut the total below money already collected. See `lock.ts`.
    await lockOrderForWrite(tx, ownerId, orderId);

    const paymentCount = await tx.payment.count({ where: { orderId } });

    if (!isOrderEditable(paymentCount)) {
      throw orderLocked();
    }

    await tx.lineItem.deleteMany({ where: { orderId } });

    const order = await tx.order.update({
      where: { id: orderId },
      data: {
        customer: input.customer,
        dueDate: toDateOnly(input.dueDate),
        notes: input.notes ?? null,
        lineItems: {
          create: input.lineItems.map((line, index) => ({
            description: line.description,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
            position: index,
          })),
        },
      },
      include: ORDER_INCLUDE,
    });

    return toOrderDto(order, asOf);
  });
}

/**
 * Deletes an order.
 *
 * Refused once payments exist: removing an order that has money recorded
 * against it destroys the record of that money, which is the one thing this
 * product exists to keep.
 *
 * The guard and the delete run in one transaction holding the row lock. Split
 * across two auto-commit statements they were racy in the worst possible way,
 * because `Payment.orderId` cascades: a payment that committed between the
 * check and the DELETE was silently erased, having already been acknowledged to
 * its caller with a 201.
 */
export async function deleteOrder(
  ownerId: string,
  orderId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockOrderForWrite(tx, ownerId, orderId);

    const paymentCount = await tx.payment.count({ where: { orderId } });

    if (!isOrderEditable(paymentCount)) {
      throw orderLocked();
    }

    try {
      // Line items cascade via the schema's onDelete rule.
      await tx.order.delete({ where: { id: orderId } });
    } catch (error) {
      /**
       * Two DELETEs for the same order: the loser's row lock is released by a
       * commit that removed the row, so its own delete raises P2025. That is a
       * 404 (it is gone), not a 500 (nothing is broken).
       */
      if (isMissingRecord(error)) {
        throw notFound("order");
      }
      throw error;
    }
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/** P2025: the row a write targeted was not there. */
function isMissingRecord(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}
