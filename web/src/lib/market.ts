/** The noisy market feed on the first screen: live 24h changes from Binance, sample data as fallback. */

export interface FeedItem { symbol: string; change: number }

export const FEED_SYMBOLS = [
  'BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK',
  'TRX', 'LTC', 'NEAR', 'APT', 'ARB', 'OP', 'SUI', 'ATOM', 'UNI', 'BCH',
];

/** A halted pair keeps returning its last 24h window; anything older than this is not "live". */
const STALE_MS = 6 * 60 * 60 * 1000;

export const SAMPLE_FEED: FeedItem[] = [
  1.2, -0.8, 6.3, -1.9, 0.4, 0.9, -2.7, 5.1, -3.3, -1.1, 2.2, 0.3, -0.6, 4.4, -2.0, -4.8, 1.7, 6.2, -1.4, 2.9,
].map((change, i) => ({ symbol: FEED_SYMBOLS[i]!, change }));

const BASES = ['https://data-api.binance.vision', 'https://api.binance.com'];

export async function fetchLiveFeed(): Promise<FeedItem[] | null> {
  const symbols = encodeURIComponent(JSON.stringify(FEED_SYMBOLS.map((s) => `${s}USDT`)));
  for (const base of BASES) {
    try {
      const res = await fetch(`${base}/api/v3/ticker/24hr?type=FULL&symbols=${symbols}`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const rows = (await res.json()) as { symbol: string; priceChangePercent: string; closeTime: number }[];
      const fresh = rows.filter((r) => Date.now() - r.closeTime < STALE_MS);
      const bySymbol = new Map(fresh.map((r) => [r.symbol.replace(/USDT$/, ''), Number(r.priceChangePercent)]));
      const feed = FEED_SYMBOLS.filter((s) => Number.isFinite(bySymbol.get(s))).map((s) => ({ symbol: s, change: bySymbol.get(s)! }));
      if (feed.length >= 10) return feed;
    } catch { /* try the next host */ }
  }
  return null;
}
