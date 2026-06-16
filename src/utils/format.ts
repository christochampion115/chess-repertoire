/** Formats centipawns to readable score string: '+2.14', '-0.50', 'Mat' */
export function formatCp(cp: number): string {
  if (Math.abs(cp) >= 90_000) return 'Mat';
  return `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(2)}`;
}

/** Formats a mate count: '#5' (positive = we give mate) */
export function formatMate(mateIn: number): string {
  return `#${Math.abs(mateIn)}`;
}

/** Computes white winning percentage from centipawns (sigmoid). */
export function cpToWhitePct(cp: number): number {
  const pct = 50 + 50 * (2 / (1 + Math.exp(-0.003 * cp)) - 1);
  return Math.min(97, Math.max(3, pct));
}

/** Formats a number as a short string: 1500 → '1.5K', 1000000 → '1M'. */
export function formatNumberShort(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace('.0', '') + 'Md';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.0', '') + 'K';
  return n.toString();
}

/** Formats value/total as a rounded percentage string: '34%'. */
export function formatPercent(value: number, total: number): string {
  if (!total) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}
