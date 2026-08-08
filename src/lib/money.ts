/**
 * Money.
 *
 * THE INVARIANT: there is no such thing as a "dollars number" in this codebase.
 *
 * Money exists in exactly two forms:
 *   - an integer count of minor units (cents), named `*Cents`, used everywhere
 *     internally and in the database;
 *   - a string, either raw user input on the way in or formatted output on the
 *     way out.
 *
 * A `number` holding 12.34 never exists. That removes the entire class of bug
 * where dollars and cents get mixed at a call site, because there is nothing to
 * mix cents up with.
 *
 * Floating point never touches a value here. Not in parsing (a decimal string
 * is split and combined with integer arithmetic) and not in formatting (the
 * integer is sliced as a string). `Math.round(parseFloat("0.29") * 100)` is 29
 * but `Math.floor` of it is 28, because 0.29 * 100 is 28.999999999999996. That
 * bug does not exist here because that multiplication is never performed.
 */

/** Display currency. Single source so it is not hardcoded across the UI. */
export const CURRENCY_SYMBOL = "$";
export const CURRENCY_CODE = "USD";

/**
 * Ceiling for any single stored money value.
 *
 * PostgreSQL `INTEGER` tops out at 2,147,483,647, which is $21,474,836.47 in
 * cents. This limit sits comfortably below that so an amount can never
 * overflow the column, and it is a round number a human can read back in an
 * error message.
 */
export const MAX_AMOUNT_CENTS = 999_999_999;

/** Ceiling for a line item quantity, so `quantity * unitPrice` stays sane. */
export const MAX_QUANTITY = 100_000;

export type MoneyParseResult =
  | { ok: true; cents: number }
  | { ok: false; error: string };

/**
 * Parses a user-entered amount into integer cents.
 *
 * Accepts: "1000", "1000.5", "1,000.50", "$1,000.50", " 1000.50 ".
 * Rejects: negatives, more than two decimal places, empty input, anything
 * non-numeric, and values above `MAX_AMOUNT_CENTS`.
 *
 * More than two decimals is rejected rather than rounded on purpose. Silently
 * turning an entered 10.999 into 11.00 changes what the user said by a cent,
 * and on a money screen that is worse than making them retype it.
 */
export function parseAmountToCents(input: string): MoneyParseResult {
  const raw = input.trim();

  if (raw.length === 0) {
    return { ok: false, error: "Enter an amount." };
  }

  const withoutSymbol = raw.replace(CURRENCY_SYMBOL, "").replace(/\s/g, "");

  /**
   * Input that is ONLY punctuation gets "enter an amount": there is nothing to
   * correct, only something to type. Anything else the user actually typed
   * falls through to the format message, which is more use to them than being
   * told to enter an amount they believe they just entered.
   */
  if (withoutSymbol.length === 0 || /^[.,]+$/.test(withoutSymbol)) {
    return { ok: false, error: "Enter an amount." };
  }

  /**
   * Commas must be in thousands positions.
   *
   * Stripping them unconditionally is what most implementations do, and it
   * silently misreads continental notation: "1,50" means one euro fifty in most
   * of Europe, and blind stripping turns it into 150, a hundredfold error that
   * no validation downstream can detect because 150 is a perfectly valid
   * amount.
   *
   * Rather than guess which convention the user meant, groups are required to
   * be exactly three digits. "1,000.50" is accepted, "1,50" is refused with a
   * message that says what is wrong.
   */
  if (withoutSymbol.includes(",")) {
    const wellGrouped = /^\d{1,3}(,\d{3})*(\.\d+)?$/.test(withoutSymbol);

    if (!wellGrouped) {
      return {
        ok: false,
        error:
          "Use a full stop for decimals and commas only between thousands, for example 1,250.50.",
      };
    }
  }

  // Presentational characters removed, having first confirmed they were used
  // presentationally.
  const cleaned = withoutSymbol.replace(/,/g, "");

  if (cleaned.length === 0) {
    return { ok: false, error: "Enter an amount." };
  }

  if (cleaned.startsWith("-")) {
    return { ok: false, error: "Amount cannot be negative." };
  }

  // Checked before the general format test below, otherwise the general test
  // rejects first and the user gets "enter a valid amount" for what is really
  // a precision problem they can fix in one keystroke.
  if (/^\d*\.\d{3,}$/.test(cleaned)) {
    return { ok: false, error: "Amounts cannot have more than two decimals." };
  }

  // Requires at least one digit, and at most two decimal places.
  const match = /^(\d*)(?:\.(\d{1,2}))?$/.exec(cleaned);

  if (!match || (match[1] === "" && match[2] === undefined)) {
    return {
      ok: false,
      error: "Enter a valid amount, for example 1250.00.",
    };
  }

  const [, wholePart = "", fracPart] = match;

  const whole = wholePart === "" ? 0 : Number(wholePart);
  const frac = fracPart === undefined ? 0 : Number(fracPart.padEnd(2, "0"));

  if (!Number.isSafeInteger(whole)) {
    return { ok: false, error: "That amount is too large." };
  }

  const cents = whole * 100 + frac;

  if (cents > MAX_AMOUNT_CENTS) {
    return {
      ok: false,
      error: `Amount cannot exceed ${formatMoney(MAX_AMOUNT_CENTS)}.`,
    };
  }

  return { ok: true, cents };
}

/**
 * Formats integer cents as a grouped decimal string: 123456 -> "1,234.56".
 *
 * Built by slicing the integer as a string rather than dividing by 100, so no
 * float rounding can occur at any magnitude.
 */
export function formatCents(cents: number): string {
  if (!Number.isFinite(cents)) {
    throw new TypeError(`formatCents received a non-finite value: ${cents}`);
  }

  const negative = cents < 0;
  const digits = String(Math.abs(Math.trunc(cents))).padStart(3, "0");

  const whole = digits.slice(0, -2);
  const frac = digits.slice(-2);

  // Insert a separator every three digits from the right.
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${negative ? "-" : ""}${grouped}.${frac}`;
}

/** Formats integer cents with the currency symbol: 123456 -> "$1,234.56". */
export function formatMoney(cents: number): string {
  const formatted = formatCents(cents);
  return formatted.startsWith("-")
    ? `-${CURRENCY_SYMBOL}${formatted.slice(1)}`
    : `${CURRENCY_SYMBOL}${formatted}`;
}

/**
 * Sums integer cents.
 *
 * Guards the result rather than trusting it: every caller sums values that came
 * from the database, and a silent loss of precision above 2^53 would corrupt a
 * balance without raising anything.
 */
export function sumCents(values: readonly number[]): number {
  let total = 0;

  for (const value of values) {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(
        `sumCents received a non-integer value: ${String(value)}`,
      );
    }
    total += value;
  }

  if (!Number.isSafeInteger(total)) {
    throw new RangeError("Sum of amounts exceeded the safe integer range.");
  }

  return total;
}

/** True when the value is a usable, non-negative, in-range cent amount. */
export function isValidCents(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_AMOUNT_CENTS
  );
}
