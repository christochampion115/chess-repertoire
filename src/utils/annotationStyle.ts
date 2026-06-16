// From board.js – ANNOTATION_STYLE
export const ANNOTATION_STYLE: Record<string, { color: string; label: string }> = {
  '!!': { color: '#33c6b0', label: '!!' },
  '!':  { color: '#7ca5d4', label: '!' },
  '!?': { color: '#ddc041', label: '!?' },
  '?':  { color: '#dd8241', label: '?' },
  '??': { color: '#d66161', label: '??' },
  '?!': { color: '#e1975d', label: '?!' },
  'v':  { color: '#b8e6b8', label: '✓' },
  '+':  { color: '#5cb85c', label: '+' },
  '*':  { color: '#27ae60', label: '★' },
};

/** Convert a hex colour string to rgba() with the given alpha. */
export function hexToRgba(hex: string, alpha: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}
