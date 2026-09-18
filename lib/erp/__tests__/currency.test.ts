import { describe, it, expect } from "vitest";
import { CURRENCY, formatMoney } from "../currency";

/**
 * The ledger stores bare numbers — `invoices.total` is a REAL, and nothing
 * about the column says what it counts. This is the one place that says, so
 * anything printing a figure prints the same currency.
 */
describe("the company's currency", () => {
  it("is dollars", () => {
    expect(CURRENCY).toMatchObject({ code: "USD", symbol: "$" });
  });

  it("formats a figure with its symbol, two decimals and thousands", () => {
    expect(formatMoney(14903.2)).toBe("$14,903.20");
    expect(formatMoney(0)).toBe("$0.00");
  });
});
