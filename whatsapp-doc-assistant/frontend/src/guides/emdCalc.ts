// Arithmetic for the EMD calculator (/guides/emd-calculator). Amounts are
// rupees; results are rounded to the paisa.

/** A rupee amount as people type it: "40,35,586.00", "Rs. 5 00 000", "₹2500000". Null if it isn't a positive number. */
export function parseRupees(input: string): number | null {
  const cleaned = String(input || '').replace(/rs\.?|inr|₹|,|\s/gi, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** `percent`% of `amount`, rounded to the paisa. */
export function percentOf(amount: number, percent: number): number {
  return Math.round(amount * percent) / 100;
}

/** "80,711.72": Indian digit grouping, always two decimals. */
export function formatRupees(amount: number): string {
  return amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
