/**
 * Currency Formatting Utilities (INR)
 * Always shows exactly 0 decimal places for monetary values.
 */
/**
 * Format a number as INR without the ₹ prefix (for use with inline symbols).
 * Example: 1113285.69 → "11,13,286"
 */
export function formatCurrencyValue(value: number | null | undefined): string {
  const n = value ?? 0;
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
