import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aedToFils,
  calculatePlatformFeeAed,
  calculatePlatformFeeFils,
  computeRemainingBudgetFils,
  filsToAedString,
  formatAed,
  percentageToBps,
  splitAmountEvenlyFils,
} from "@/lib/money";

describe("money & platform fee math (exact integer fils, zero floats)", () => {
  it("converts exact AED strings to integer fils and back", () => {
    assert.equal(aedToFils("0"), 0);
    assert.equal(aedToFils("0.00"), 0);
    assert.equal(aedToFils("0.05"), 5);
    assert.equal(aedToFils("5.5"), 550);
    assert.equal(aedToFils("9.99"), 999);
    assert.equal(aedToFils("10.00"), 1000);
    assert.equal(aedToFils("10.01"), 1001);
    assert.equal(aedToFils("40.00"), 4000);

    assert.equal(filsToAedString(0), "0.00");
    assert.equal(filsToAedString(5), "0.05");
    assert.equal(filsToAedString(999), "9.99");
    assert.equal(filsToAedString(1000), "10.00");
    assert.equal(filsToAedString(1001), "10.01");
  });

  it("rejects malformed decimal strings", () => {
    assert.throws(() => aedToFils("12.345"));
    assert.throws(() => aedToFils("abc"));
    assert.throws(() => aedToFils(""));
    assert.throws(() => percentageToBps("150.00"));
  });

  it("calculates platform fee with round-half-up across all required edge cases", () => {
    // Edge case 1: AED 0.00 -> AED 0.00
    assert.equal(calculatePlatformFeeAed({ subtotalAed: "0.00" }).feeAmountAed, "0.00");

    // Edge case 2: AED 0.05 -> 10% is 0.005 AED (0.5 fils) -> round half up -> AED 0.01
    assert.equal(calculatePlatformFeeAed({ subtotalAed: "0.05" }).feeAmountAed, "0.01");

    // Edge case 3: AED 0.04 -> 10% is 0.004 AED (0.4 fils) -> rounds down -> AED 0.00
    assert.equal(calculatePlatformFeeAed({ subtotalAed: "0.04" }).feeAmountAed, "0.00");

    // Edge case 4: Spec example AED 5.00 -> AED 0.50
    assert.equal(calculatePlatformFeeAed({ subtotalAed: "5.00" }).feeAmountAed, "0.50");

    // Edge case 5: AED 9.99 -> 10% is 0.999 AED (99.9 fils) -> round half up -> AED 1.00
    assert.equal(calculatePlatformFeeAed({ subtotalAed: "9.99" }).feeAmountAed, "1.00");

    // Edge case 6: AED 9.94 -> 10% is 0.994 AED (99.4 fils) -> AED 0.99
    assert.equal(calculatePlatformFeeAed({ subtotalAed: "9.94" }).feeAmountAed, "0.99");

    // Edge case 7: AED 10.00 -> exact boundary -> AED 1.00
    assert.equal(calculatePlatformFeeAed({ subtotalAed: "10.00" }).feeAmountAed, "1.00");

    // Edge case 8: AED 10.01 -> 10% is 1.001 AED -> capped at AED 1.00
    assert.equal(calculatePlatformFeeAed({ subtotalAed: "10.01" }).feeAmountAed, "1.00");

    // Edge case 9: Spec example AED 80.00 -> capped at AED 1.00
    assert.equal(calculatePlatformFeeAed({ subtotalAed: "80.00" }).feeAmountAed, "1.00");
  });

  it("supports admin-configurable fee percentage and cap", () => {
    assert.equal(
      calculatePlatformFeeAed({
        subtotalAed: "35.00",
        feePercentage: "5.00",
        feeCapAed: "2.50",
      }).feeAmountAed,
      "1.75",
    );

    assert.equal(
      calculatePlatformFeeAed({
        subtotalAed: "80.00",
        feePercentage: "5.00",
        feeCapAed: "2.50",
      }).feeAmountAed,
      "2.50",
    );

    assert.equal(
      calculatePlatformFeeFils({ subtotalFils: 2500, feePercentageBps: 0, feeCapFils: 100 }),
      0,
    );
  });

  it("computes meal-level remaining budget and lossless bill splits", () => {
    assert.equal(computeRemainingBudgetFils(4000, 2400), 1600);
    assert.equal(computeRemainingBudgetFils(4000, 4500), 0);

    const split = splitAmountEvenlyFils(10000, 3);
    assert.deepEqual(split, [3334, 3333, 3333]);
    assert.equal(
      split.reduce((a, b) => a + b, 0),
      10000,
    );

    assert.equal(formatAed(4000, "en"), "AED 40.00");
    assert.equal(formatAed(4000, "ar"), "40.00 د.إ");
  });
});
