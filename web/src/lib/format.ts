import { fmtPct } from '@cryptopulse/shared';

export { fmtNum, fmtPct, fmtPrice, nicePrice } from '@cryptopulse/shared';

export const pct = (n: number) => `<span class="${n >= 0 ? 'up' : 'down'}">${fmtPct(n)}</span>`;
