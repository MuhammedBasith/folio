import { describe, expect, it } from "vitest";
import {
  AGEING_BUCKETS,
  buildAgeingReport,
  daysOverdue,
  type OrderStatus,
} from "./orders";

const ASOF = new Date("2026-08-08T12:00:00.000Z");

function order(
  dueDate: string,
  dueCents: number,
  status: OrderStatus = "overdue",
) {
  return { dueDate, dueCents, status };
}

describe("daysOverdue", () => {
  it("is zero on the due date itself, whatever the time of day", () => {
    expect(daysOverdue("2026-08-08", new Date("2026-08-08T00:00:01Z"))).toBe(0);
    expect(daysOverdue("2026-08-08", new Date("2026-08-08T23:59:59Z"))).toBe(0);
  });

  it("is negative before the due date", () => {
    expect(daysOverdue("2026-08-20", ASOF)).toBe(-12);
  });

  it("counts whole calendar days once past it", () => {
    expect(daysOverdue("2026-08-07", ASOF)).toBe(1);
    expect(daysOverdue("2026-07-09", ASOF)).toBe(30);
    expect(daysOverdue("2026-05-10", ASOF)).toBe(90);
  });

  /**
   * The whole point of reducing both sides to a calendar key. Without it a
   * late-evening `asOf` would round to a different number of days than a
   * morning one, and the report would disagree with the status badge.
   */
  it("does not drift with the time of day", () => {
    const morning = daysOverdue("2026-07-01", new Date("2026-08-08T01:00:00Z"));
    const evening = daysOverdue("2026-07-01", new Date("2026-08-08T22:00:00Z"));
    expect(morning).toBe(evening);
  });
});

describe("buildAgeingReport", () => {
  it("returns every bucket even when they are empty", () => {
    const report = buildAgeingReport([], ASOF);

    expect(report.buckets.map((b) => b.key)).toEqual(
      AGEING_BUCKETS.map((b) => b.key),
    );
    expect(report.totalCents).toBe(0);
    expect(report.overdueCents).toBe(0);
  });

  it("puts anything not yet due in current, including part paid orders", () => {
    const report = buildAgeingReport(
      [
        order("2026-08-20", 50_000, "pending"),
        order("2026-08-09", 25_000, "partially_paid"),
      ],
      ASOF,
    );

    const current = report.buckets.find((b) => b.key === "current")!;
    expect(current.cents).toBe(75_000);
    expect(current.count).toBe(2);
    expect(report.overdueCents).toBe(0);
  });

  /**
   * Boundaries, both sides of every edge. Off-by-one here would silently move
   * money between buckets and nobody would notice until a total looked wrong.
   */
  it.each([
    ["2026-08-08", "current", 0],
    ["2026-08-07", "d1_30", 1],
    ["2026-07-09", "d1_30", 30],
    ["2026-07-08", "d31_60", 31],
    ["2026-06-09", "d31_60", 60],
    ["2026-06-08", "d61_90", 61],
    ["2026-05-10", "d61_90", 90],
    ["2026-05-09", "d90_plus", 91],
  ])("%s lands in %s (%i days)", (due, bucket, days) => {
    expect(daysOverdue(due, ASOF)).toBe(days);

    const report = buildAgeingReport([order(due, 10_000)], ASOF);
    const filled = report.buckets.filter((b) => b.count > 0);

    expect(filled).toHaveLength(1);
    expect(filled[0].key).toBe(bucket);
  });

  it("excludes settled orders entirely", () => {
    const report = buildAgeingReport(
      [order("2026-01-01", 0, "paid"), order("2026-01-01", 40_000, "overdue")],
      ASOF,
    );

    expect(report.totalCents).toBe(40_000);
    expect(report.buckets.reduce((n, b) => n + b.count, 0)).toBe(1);
  });

  /**
   * A defensive case rather than a reachable one: `dueCents` is clamped at zero
   * upstream, but an order with nothing outstanding must never be counted as a
   * debt regardless of what its stored status says.
   */
  it("excludes orders with nothing outstanding whatever their status", () => {
    const report = buildAgeingReport([order("2026-01-01", 0, "overdue")], ASOF);
    expect(report.totalCents).toBe(0);
    expect(report.buckets.every((b) => b.count === 0)).toBe(true);
  });

  it("sums to the same total as the orders it was given", () => {
    const orders = [
      order("2026-08-20", 50_000, "pending"),
      order("2026-08-01", 12_345),
      order("2026-06-30", 700),
      order("2026-01-02", 99_999),
    ];

    const report = buildAgeingReport(orders, ASOF);

    expect(report.totalCents).toBe(50_000 + 12_345 + 700 + 99_999);
    expect(report.overdueCents).toBe(12_345 + 700 + 99_999);
    expect(report.buckets.reduce((n, b) => n + b.cents, 0)).toBe(
      report.totalCents,
    );
  });

  it("keeps cents exact across many orders", () => {
    // Thirty one-cent debts. In floats this is the classic accumulation that
    // ends in 0.30000000000000004; in cents it is 30.
    const orders = Array.from({ length: 30 }, () => order("2026-08-01", 1));
    expect(buildAgeingReport(orders, ASOF).totalCents).toBe(30);
  });
});
