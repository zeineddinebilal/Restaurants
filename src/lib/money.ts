/**
 * Exact monetary arithmetic in integer fils (1 AED = 100 fils) and basis points
 * (1% = 100 bps, 100% = 10,000 bps).
 *
 * ZERO floating-point math (`parseFloat`, `Number(x) * 0.1`, etc.) is permitted
 * anywhere in money, budget, bill split, or fee calculations.
 */

export interface DecimalLike {
  toString(): string;
}

export type MoneyInput = string | DecimalLike;

const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Converts an exact decimal AED value (e.g. "40", "40.00", "9.99", Prisma.Decimal)
 * into integer fils without using floating-point numbers.
 */
export function aedToFils(value: MoneyInput): number {
  const raw = typeof value === "string" ? value.trim() : value.toString().trim();
  const match = DECIMAL_PATTERN.exec(raw);
  if (!match) {
    throw new Error(`Invalid monetary AED value: "${raw}". Expected up to 2 decimal places.`);
  }

  const sign = match[1] === "-" ? -1 : 1;
  const wholeDirhams = BigInt(match[2]);
  const fracStr = (match[3] ?? "").padEnd(2, "0");
  const filsPart = BigInt(fracStr);
  const total = BigInt(sign) * (wholeDirhams * 100n + filsPart);

  const asNumber = Number(total);
  if (!Number.isSafeInteger(asNumber)) {
    throw new Error(`Monetary value out of safe integer range: "${raw}"`);
  }
  return asNumber;
}

/**
 * Converts a percentage string/Decimal (up to 2 decimal places, e.g. "10" or "10.00" or "7.5")
 * into integer basis points (100% = 10,000 bps; 10.00% = 1,000 bps).
 */
export function percentageToBps(percentage: MoneyInput): number {
  const bps = aedToFils(percentage);
  if (bps < 0 || bps > 10000) {
    throw new Error(`Fee percentage out of valid [0, 100] range: "${percentage.toString()}"`);
  }
  return bps;
}

/**
 * Formats integer fils as an exact canonical 2-decimal string (e.g. 105 -> "1.05", 50 -> "0.50").
 */
export function filsToAedString(fils: number): string {
  if (!Number.isSafeInteger(fils)) {
    throw new Error(`Fils must be a safe integer, received: ${fils}`);
  }
  const isNegative = fils < 0;
  const abs = Math.abs(fils);
  const dirhams = Math.trunc(abs / 100);
  const remFils = abs % 100;
  const formatted = `${dirhams}.${String(remFils).padStart(2, "0")}`;
  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Formats integer fils for display in English ("AED 40.00") or Arabic ("40.00 د.إ").
 */
export function formatAed(fils: number, locale: "en" | "ar" = "en", currency = "AED"): string {
  const amount = filsToAedString(fils);
  if (locale === "ar" && currency === "AED") {
    return `${amount} د.إ`;
  }
  return `${currency} ${amount}`;
}

/**
 * Divides two non-negative BigInts with exact Round-Half-Up semantics.
 * Example: 5000n / 10000n -> 1n (0.5 rounds up to 1).
 */
export function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new Error("Denominator must be positive");
  }
  if (numerator < 0n) {
    throw new Error("Numerator must be non-negative");
  }
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  // Half-up check: remainder * 2 >= denominator
  if (remainder * 2n >= denominator) {
    return quotient + 1n;
  }
  return quotient;
}

/**
 * Calculates the platform fee in integer fils:
 *   fee = min(capFils, roundHalfUp(subtotalFils * rateBps / 10000))
 */
export function calculatePlatformFeeFils(params: {
  subtotalFils: number;
  feePercentageBps?: number;
  feeCapFils?: number;
}): number {
  const { subtotalFils, feePercentageBps = 1000, feeCapFils = 100 } = params;

  if (!Number.isSafeInteger(subtotalFils) || subtotalFils < 0) {
    throw new Error(`Invalid subtotalFils: ${subtotalFils}`);
  }
  if (!Number.isSafeInteger(feePercentageBps) || feePercentageBps < 0 || feePercentageBps > 10000) {
    throw new Error(`Invalid feePercentageBps: ${feePercentageBps}`);
  }
  if (!Number.isSafeInteger(feeCapFils) || feeCapFils < 0) {
    throw new Error(`Invalid feeCapFils: ${feeCapFils}`);
  }

  if (subtotalFils === 0 || feePercentageBps === 0 || feeCapFils === 0) {
    return 0;
  }

  const rawPctFils = Number(
    divideRoundHalfUp(BigInt(subtotalFils) * BigInt(feePercentageBps), 10000n),
  );
  return Math.min(feeCapFils, rawPctFils);
}

/**
 * Convenience wrapper accepting exact AED strings / Prisma.Decimal values
 * and returning the exact 2-decimal AED string for Prisma storage.
 */
export function calculatePlatformFeeAed(params: {
  subtotalAed: MoneyInput;
  feePercentage?: MoneyInput;
  feeCapAed?: MoneyInput;
}): {
  subtotalFils: number;
  feeFils: number;
  feeAmountAed: string;
} {
  const subtotalFils = aedToFils(params.subtotalAed);
  const feePercentageBps =
    params.feePercentage !== undefined ? percentageToBps(params.feePercentage) : 1000;
  const feeCapFils = params.feeCapAed !== undefined ? aedToFils(params.feeCapAed) : 100;

  const feeFils = calculatePlatformFeeFils({
    subtotalFils,
    feePercentageBps,
    feeCapFils,
  });

  return {
    subtotalFils,
    feeFils,
    feeAmountAed: filsToAedString(feeFils),
  };
}

/**
 * Computes a diner's remaining meal budget in fils given their meal budget
 * and the sum of items already in their cart.
 */
export function computeRemainingBudgetFils(
  maxBudgetFils: number,
  currentCartTotalFils: number,
): number {
  if (!Number.isSafeInteger(maxBudgetFils) || maxBudgetFils < 0) {
    throw new Error(`Invalid maxBudgetFils: ${maxBudgetFils}`);
  }
  if (!Number.isSafeInteger(currentCartTotalFils) || currentCartTotalFils < 0) {
    throw new Error(`Invalid currentCartTotalFils: ${currentCartTotalFils}`);
  }
  return Math.max(0, maxBudgetFils - currentCartTotalFils);
}

/**
 * Splits a shared amount in fils across `count` diners without losing a single fil.
 * Remainder fils (0 .. count-1) are distributed 1 fil each to the first diners.
 */
export function splitAmountEvenlyFils(totalFils: number, count: number): number[] {
  if (!Number.isSafeInteger(totalFils) || totalFils < 0) {
    throw new Error(`Invalid totalFils: ${totalFils}`);
  }
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new Error(`Invalid participant count: ${count}`);
  }
  const base = Math.trunc(totalFils / count);
  const remainder = totalFils % count;
  return Array.from({ length: count }, (_, idx) => (idx < remainder ? base + 1 : base));
}
