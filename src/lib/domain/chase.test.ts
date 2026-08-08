import { describe, expect, it } from "vitest";
import { buildChaseMessage, type ChaseInput } from "./chase";

const ASOF = new Date("2026-08-08T12:00:00.000Z");

function input(overrides: Partial<ChaseInput> = {}): ChaseInput {
  return {
    reference: "ORD-0002",
    customer: "Acme Corp",
    dueDate: "2026-08-03",
    totalCents: 219_600,
    paidCents: 100_000,
    dueCents: 119_600,
    status: "overdue",
    asOf: ASOF,
    ...overrides,
  };
}

describe("buildChaseMessage", () => {
  it("refuses to chase an order with nothing outstanding", () => {
    expect(() =>
      buildChaseMessage(input({ dueCents: 0, status: "paid" })),
    ).toThrow(/nothing outstanding/i);
  });

  it("refuses even when the status has not caught up with the balance", () => {
    expect(() => buildChaseMessage(input({ dueCents: 0 }))).toThrow();
    expect(() => buildChaseMessage(input({ status: "paid" }))).toThrow();
  });

  describe("tone escalates with age", () => {
    it.each([
      ["2026-08-20", "reminder"],
      ["2026-08-08", "reminder"],
      ["2026-08-07", "nudge"],
      ["2026-07-09", "nudge"],
      ["2026-07-08", "firm"],
      ["2026-05-10", "firm"],
      ["2026-05-09", "final"],
    ] as const)("due %s reads as %s", (due, tone) => {
      expect(buildChaseMessage(input({ dueDate: due })).tone).toBe(tone);
    });

    /**
     * The wording has to match the register, not just the label. A "final"
     * message that still opens with "I appreciate these things slip through"
     * would be the tone field lying about the body.
     */
    it("does not apologise in the final message", () => {
      const message = buildChaseMessage(input({ dueDate: "2026-01-01" }));
      expect(message.body).not.toMatch(/slip through/i);
      expect(message.body).toMatch(/remains unpaid/i);
    });

    it("does not threaten in the first reminder", () => {
      const message = buildChaseMessage(input({ dueDate: "2026-08-20" }));
      expect(message.body).not.toMatch(/escalate|remains unpaid/i);
      expect(message.body).toMatch(/falls due/i);
    });
  });

  describe("the money in the message", () => {
    it("acknowledges a part payment before asking for the balance", () => {
      const body = buildChaseMessage(input()).body;

      expect(body).toContain("Received, with thanks: $1,000.00");
      expect(body).toContain("Still outstanding: $1,196.00");
      expect(body.indexOf("Received, with thanks")).toBeLessThan(
        body.indexOf("Still outstanding"),
      );
    });

    it("asks for the amount due, never the order total", () => {
      const message = buildChaseMessage(input());

      expect(message.subject).toContain("$1,196.00");
      expect(message.subject).not.toContain("$2,196.00");
    });

    it("keeps it simple when nothing has been paid", () => {
      const body = buildChaseMessage(input({ paidCents: 0, dueCents: 219_600 }))
        .body;

      expect(body).toContain("Amount: $2,196.00");
      expect(body).not.toMatch(/Received, with thanks/);
    });

    it("never rounds: a one cent balance is chased as one cent", () => {
      const message = buildChaseMessage(
        input({ totalCents: 10_000, paidCents: 9_999, dueCents: 1 }),
      );

      expect(message.subject).toContain("$0.01");
      expect(message.body).toContain("Still outstanding: $0.01");
    });
  });

  describe("the message reads as something a person wrote", () => {
    it("opens with the customer and closes with the sender", () => {
      const body = buildChaseMessage(input({ senderName: "Basith" })).body;

      expect(body.startsWith("Hello Acme Corp,")).toBe(true);
      expect(body.trimEnd().endsWith("Basith")).toBe(true);
    });

    it("leaves no dangling blank line when there is no sender", () => {
      const body = buildChaseMessage(input()).body;

      expect(body).toBe(body.trimEnd());
      expect(body.endsWith("Thanks very much,")).toBe(true);
    });

    it("always offers the out, in case it was already paid", () => {
      for (const due of ["2026-08-20", "2026-08-01", "2026-01-01"]) {
        const body = buildChaseMessage(input({ dueDate: due })).body;
        expect(body).toMatch(/already (been )?paid|balance has been sent/i);
      }
    });

    it("writes the due date unambiguously, in UTC", () => {
      // Parsed and formatted in UTC on both sides. A local parse west of
      // Greenwich would print the 2nd for a date stored as the 3rd.
      const body = buildChaseMessage(input()).body;
      expect(body).toContain("Due: 3 August 2026");
    });

    it("carries the reference so a reply can be matched to an order", () => {
      const message = buildChaseMessage(input());
      expect(message.subject).toContain("ORD-0002");
      expect(message.body).toContain("ORD-0002");
    });
  });
});
