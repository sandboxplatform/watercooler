/**
 * What the company's money is denominated in.
 *
 * The ledger stores bare numbers: `invoices.total` is a REAL, and nothing about
 * the column says what it counts. So the currency has to be written down
 * somewhere, and this is that somewhere — one constant, so nothing printing a
 * figure has to decide for itself.
 */
export const CURRENCY = {
  code: "USD",
  symbol: "$",
  name: "US dollars",
} as const;

/** "$1,204.50", for display. Never for a value going back into the books. */
export function formatMoney(value: number): string {
  return `${CURRENCY.symbol}${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
