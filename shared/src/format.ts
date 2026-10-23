export const fmtNum = (n: number) => String(Math.round(n * 10) / 10);

export const fmtPct = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(1) + '%';

export const fmtPrice = (n: number) =>
  '$' + (n >= 1000 ? Math.round(n).toLocaleString('en-US') : n.toFixed(n >= 1 ? 2 : 4));

/** Rounds a price to a level people would actually type. */
export function nicePrice(n: number): number {
  const step = n >= 10000 ? 500 : n >= 1000 ? 50 : n >= 100 ? 5 : n >= 10 ? 0.5 : 0.05;
  return Number((Math.round(n / step) * step).toFixed(2));
}
