// Coins a user can put on a watchlist. The order here is the display order everywhere.
// Every pair must be actively trading on Binance spot (TONUSDT, for example, is halted and was dropped).
export const COIN_IDS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE'] as const;

export type CoinId = (typeof COIN_IDS)[number];

export const COINS: Record<CoinId, { name: string; pair: string }> = {
  BTC: { name: 'Bitcoin', pair: 'BTCUSDT' },
  ETH: { name: 'Ethereum', pair: 'ETHUSDT' },
  SOL: { name: 'Solana', pair: 'SOLUSDT' },
  XRP: { name: 'XRP', pair: 'XRPUSDT' },
  BNB: { name: 'BNB', pair: 'BNBUSDT' },
  DOGE: { name: 'Dogecoin', pair: 'DOGEUSDT' },
};

export function isCoinId(value: string): value is CoinId {
  return (COIN_IDS as readonly string[]).includes(value);
}

/** Keeps known coins only, without duplicates, in display order. */
export function normalizeCoins(values: readonly string[]): CoinId[] {
  const upper = new Set(values.map((v) => v.toUpperCase()));
  return COIN_IDS.filter((c) => upper.has(c));
}
