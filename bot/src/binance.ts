import { COIN_IDS, COINS, type CoinId } from '@cryptopulse/shared';

export interface Ticker { coin: CoinId; price: number; changePct: number }
export type TickerWindow = '1d' | '7d';

const FALLBACK_BASE = 'https://api.binance.com';

interface BinanceTicker { symbol: string; lastPrice: string; priceChangePercent: string; closeTime: number; count: number }

/** A halted pair keeps returning its last window with an old closeTime. Older than this, the data is not used. */
export const STALE_MS = 6 * 60 * 60 * 1000;

/**
 * One request for every coin we support. Public market data, no API key.
 * Binance blocks some regions (the US among them), so the market-data host is tried first.
 */
export async function fetchTickers(base: string, window: TickerWindow = '1d', fetchImpl: typeof fetch = fetch): Promise<Map<CoinId, Ticker>> {
  const symbols = encodeURIComponent(JSON.stringify(COIN_IDS.map((c) => COINS[c].pair)));
  const path = window === '1d' ? `/api/v3/ticker/24hr?symbols=${symbols}` : `/api/v3/ticker?windowSize=7d&symbols=${symbols}`;
  const errors: string[] = [];

  for (const host of [...new Set([base, FALLBACK_BASE])]) {
    try {
      const res = await fetchImpl(host + path, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        errors.push(`${host}: HTTP ${res.status}`);
        continue;
      }
      return parseTickers((await res.json()) as BinanceTicker[]);
    } catch (err) {
      errors.push(`${host}: ${(err as Error).message}`);
    }
  }
  throw new Error(`Binance prices unavailable (${errors.join('; ')})`);
}

export function parseTickers(rows: BinanceTicker[], now = Date.now()): Map<CoinId, Ticker> {
  const byPair = new Map(rows.map((r) => [r.symbol, r]));
  const result = new Map<CoinId, Ticker>();
  for (const coin of COIN_IDS) {
    const row = byPair.get(COINS[coin].pair);
    if (!row || row.count === 0 || now - row.closeTime > STALE_MS) continue;
    const price = Number(row.lastPrice);
    const changePct = Number(row.priceChangePercent);
    if (Number.isFinite(price) && price > 0 && Number.isFinite(changePct)) result.set(coin, { coin, price, changePct });
  }
  return result;
}
