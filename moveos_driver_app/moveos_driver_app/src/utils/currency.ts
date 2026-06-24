/**
 * Format paise (integer) into a readable rupee string.
 * 35000 → "₹350"
 * 35050 → "₹350.50"
 */
export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees % 1 === 0 ? rupees.toFixed(0) : rupees.toFixed(2)}`;
}

/**
 * Format a paise amount as a short summary, e.g. "₹350/seat"
 */
export function formatFare(paise: number): string {
  return `${formatPaise(paise)}/seat`;
}
