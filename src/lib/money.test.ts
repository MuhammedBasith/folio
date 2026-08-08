import { describe, expect, it } from "vitest";
import {
  MAX_AMOUNT_CENTS,
  formatCents,
  formatMoney,
  isValidCents,
  parseAmountToCents,
  sumCents,
} from "./money";

/** Narrowing helper so a failed parse fails the test rather than the types. */
function expectParsed(input: string): number {
  const result = parseAmountToCents(input);
  if (!result.ok) {
    throw new Error(`Expected "${input}" to parse, got: ${result.error}`);
  }
  return result.cents;
}

function expectRejected(input: string): string {
  const result = parseAmountToCents(input);
  if (result.ok) {
    throw new Error(
      `Expected "${input}" to be rejected, got ${result.cents} cents`,
    );
  }
  return result.error;
}

describe("parseAmountToCents", () => {
  it("parses whole amounts", () => {
    expect(expectParsed("1000")).toBe(100_000);
    expect(expectParsed("0")).toBe(0);
    expect(expectParsed("1")).toBe(100);
  });

  it("parses two decimal places exactly", () => {
    expect(expectParsed("1000.50")).toBe(100_050);
    expect(expectParsed("0.01")).toBe(1);
    expect(expectParsed("0.99")).toBe(99);
  });

  it("pads a single decimal place rather than misreading it", () => {
    // "1000.5" means 1000 dollars 50 cents, not 1000 dollars 5 cents.
    expect(expectParsed("1000.5")).toBe(100_050);
    expect(expectParsed("0.1")).toBe(10);
  });

  /**
   * The reason this module exists.
   *
   * `Math.floor(parseFloat("0.29") * 100)` is 28, because 0.29 * 100 evaluates
   * to 28.999999999999996 in binary floating point. Any implementation that
   * multiplies by 100 will get at least one of these wrong.
   */
  it("survives the float multiplication trap", () => {
    expect(expectParsed("0.29")).toBe(29);
    expect(expectParsed("0.07")).toBe(7);
    expect(expectParsed("8.20")).toBe(820);
    expect(expectParsed("1.10")).toBe(110);
    expect(expectParsed("4.35")).toBe(435);
  });

  it.each([
    ["0.29", 29],
    ["0.57", 57],
    ["0.58", 58],
    ["1.15", 115],
    ["4.35", 435],
    ["16.08", 1608],
    ["35.85", 3585],
    ["1.005", null],
  ])("parses %s without float drift", (input, expected) => {
    const result = parseAmountToCents(input);
    if (expected === null) {
      expect(result.ok).toBe(false);
    } else {
      expect(result.ok && result.cents).toBe(expected);
    }
  });

  it("strips presentational characters", () => {
    expect(expectParsed("$1,234.56")).toBe(123_456);
    expect(expectParsed("  1000.00  ")).toBe(100_000);
    expect(expectParsed("1,000,000")).toBe(100_000_000);
    expect(expectParsed("1,000,000.99")).toBe(100_000_099);
  });

  /**
   * Continental notation.
   *
   * "1,50" means one fifty across most of Europe. Stripping commas blindly, as
   * most implementations do, turns it into 150: a hundredfold error that
   * nothing downstream can catch, because 150 is a perfectly valid amount.
   */
  it("refuses commas that are not thousands separators", () => {
    expect(expectRejected("1,50")).toMatch(/thousands/i);
    expect(expectRejected("1,5")).toMatch(/thousands/i);
    expect(expectRejected("12,34")).toMatch(/thousands/i);
    expect(expectRejected("1,0000")).toMatch(/thousands/i);
    expect(expectRejected("1000,000,000")).toMatch(/thousands/i);
    expect(expectRejected(",000")).toMatch(/thousands/i);
  });

  it("accepts a leading decimal point", () => {
    expect(expectParsed(".50")).toBe(50);
    expect(expectParsed(".5")).toBe(50);
  });

  it("rejects more than two decimals with a specific message", () => {
    expect(expectRejected("10.999")).toMatch(/two decimals/i);
    expect(expectRejected("0.001")).toMatch(/two decimals/i);
    // The specific message must win over the generic format error.
    expect(expectRejected("1,000.999")).toMatch(/two decimals/i);
  });

  it("rejects negatives", () => {
    expect(expectRejected("-1")).toMatch(/negative/i);
    expect(expectRejected("-0.01")).toMatch(/negative/i);
  });

  it("rejects empty and whitespace-only input", () => {
    expect(expectRejected("")).toMatch(/enter an amount/i);
    expect(expectRejected("   ")).toMatch(/enter an amount/i);
  });

  it("rejects input containing no digits at all", () => {
    // "Enter an amount" is more use here than a complaint about format: there
    // is nothing to correct, only something to type.
    expect(expectRejected("$")).toMatch(/enter an amount/i);
    expect(expectRejected(",")).toMatch(/enter an amount/i);
    expect(expectRejected(".")).toMatch(/enter an amount/i);
  });

  it("rejects malformed numbers", () => {
    expect(expectRejected("abc")).toMatch(/valid amount/i);
    expect(expectRejected("1.2.3")).toMatch(/valid amount/i);
    expect(expectRejected("1000.")).toMatch(/valid amount/i);
    expect(expectRejected("1e5")).toMatch(/valid amount/i);
    expect(expectRejected("Infinity")).toMatch(/valid amount/i);
    expect(expectRejected("NaN")).toMatch(/valid amount/i);
    expect(expectRejected("0x10")).toMatch(/valid amount/i);
  });

  it("enforces the maximum at the exact boundary", () => {
    // MAX_AMOUNT_CENTS is 999,999,999 which is 9,999,999.99.
    expect(expectParsed("9999999.99")).toBe(MAX_AMOUNT_CENTS);
    expect(expectRejected("10000000.00")).toMatch(/cannot exceed/i);
    expect(expectRejected("10000000")).toMatch(/cannot exceed/i);
  });
});

describe("formatCents", () => {
  it("always shows two decimal places", () => {
    expect(formatCents(0)).toBe("0.00");
    expect(formatCents(1)).toBe("0.01");
    expect(formatCents(10)).toBe("0.10");
    expect(formatCents(100)).toBe("1.00");
  });

  it("groups thousands", () => {
    expect(formatCents(123_456)).toBe("1,234.56");
    expect(formatCents(100_000_000)).toBe("1,000,000.00");
    expect(formatCents(99_999)).toBe("999.99");
    expect(formatCents(100_000)).toBe("1,000.00");
  });

  it("formats negatives with the sign outside the digits", () => {
    expect(formatCents(-1)).toBe("-0.01");
    expect(formatCents(-123_456)).toBe("-1,234.56");
  });

  it("throws rather than rendering a non-finite value", () => {
    expect(() => formatCents(Number.NaN)).toThrow(TypeError);
    expect(() => formatCents(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});

describe("formatMoney", () => {
  it("prefixes the currency symbol", () => {
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(123_456)).toBe("$1,234.56");
  });

  it("places the minus sign before the symbol, not after", () => {
    expect(formatMoney(-500)).toBe("-$5.00");
  });
});

describe("round tripping", () => {
  it.each([
    "0",
    "0.01",
    "0.10",
    "1.00",
    "999.99",
    "1000.00",
    "1234.56",
    "9999999.99",
  ])("format(parse(%s)) returns the same value", (input) => {
    const cents = expectParsed(input);
    const formatted = formatCents(cents);
    expect(expectParsed(formatted)).toBe(cents);
  });
});

describe("sumCents", () => {
  it("sums integers exactly", () => {
    expect(sumCents([])).toBe(0);
    expect(sumCents([1, 2, 3])).toBe(6);
    expect(sumCents([3333, 3333, 3334])).toBe(10_000);
  });

  /**
   * The scenario this whole approach exists to protect. As floats,
   * 33.33 + 33.33 + 33.33 is 99.99000000000001, which is not equal to 99.99
   * and would break a `paid >= total` comparison. As cents it is exact.
   */
  it("keeps repeated fractional amounts exact", () => {
    const cents = [3333, 3333, 3333];
    expect(sumCents(cents)).toBe(9999);
    expect(sumCents(cents)).not.toBe(10_000);
    expect(sumCents([...cents, 1])).toBe(10_000);
  });

  it("throws on non-integer input rather than silently truncating", () => {
    expect(() => sumCents([1.5])).toThrow(TypeError);
    expect(() => sumCents([Number.NaN])).toThrow(TypeError);
    expect(() => sumCents([1, 2, 3.0001])).toThrow(TypeError);
  });

  it("throws when the total leaves the safe integer range", () => {
    expect(() =>
      sumCents([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]),
    ).toThrow(RangeError);
  });
});

describe("isValidCents", () => {
  it("accepts in-range non-negative integers", () => {
    expect(isValidCents(0)).toBe(true);
    expect(isValidCents(1)).toBe(true);
    expect(isValidCents(MAX_AMOUNT_CENTS)).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isValidCents(-1)).toBe(false);
    expect(isValidCents(1.5)).toBe(false);
    expect(isValidCents(MAX_AMOUNT_CENTS + 1)).toBe(false);
    expect(isValidCents("100")).toBe(false);
    expect(isValidCents(null)).toBe(false);
    expect(isValidCents(undefined)).toBe(false);
    expect(isValidCents(Number.NaN)).toBe(false);
  });
});
