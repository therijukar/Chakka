/**
 * Format currency in Indian numbering format: 125000 -> "₹1,25,000"
 */
export function formatINR(amount: number | string | null | undefined, decimals = 0): string {
  const num = Number(amount ?? 0);
  if (Number.isNaN(num)) return '₹0';
  const negative = num < 0;
  const formatted = Math.abs(num).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${negative ? '-' : ''}₹${formatted}`;
}

/**
 * Generates a RFC4122 v4-compatible client UUID for offline-first idempotency.
 */
export function generateClientId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
