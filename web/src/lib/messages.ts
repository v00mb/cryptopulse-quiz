import { COINS, type CoinId, type Freq, type Level, type SetupId } from '@cryptopulse/shared';
import { fmtPct, fmtPrice, nicePrice, pct } from './format';

/** Example messages for the landing and result screens. Numbers are illustrative, not live. */
export const SAMPLE_PRICES: Record<CoinId, { price: number; change: number }> = {
  BTC: { price: 104820, change: 1.2 },
  ETH: { price: 3912, change: -0.8 },
  SOL: { price: 182.4, change: 6.3 },
  XRP: { price: 2.41, change: 0.4 },
  BNB: { price: 712, change: 0.9 },
  DOGE: { price: 0.2134, change: -1.9 },
};

export interface SampleMessage { tag: string; time: string; html: string }

export function sampleMessage(setup: SetupId, coins: CoinId[], level: Level, freq: Freq): SampleMessage {
  const coin = coins[0] ?? 'BTC';
  const { name } = COINS[coin];
  const { price } = SAMPLE_PRICES[coin];

  if (setup === 'mb') {
    const weekly = freq === 'weekly';
    const span = weekly ? 'week' : 'day';
    const lines = coins.slice(0, 3).map((c) => {
      const s = SAMPLE_PRICES[c];
      return `${level === 'compact' ? c : COINS[c].name} ${fmtPrice(s.price)} ${pct(s.change)}`;
    }).join('<br>');
    const extra = {
      plain: `<p>A calm ${span}: most big coins moved less than 2%. Nothing unusual.</p><p><b>Term of the ${span}:</b> volatility means how much a price swings. Daily moves of 2–5% are normal in crypto.</p>`,
      standard: `<p>A calm ${span}: most big coins moved less than 2%.</p>`,
      compact: '',
    }[level];
    return {
      tag: `Market Basics · ${weekly ? 'weekly recap' : 'daily summary'}`,
      time: weekly ? 'Sun 10:00' : '19:00',
      html: `<b>Your ${weekly ? 'weekly recap' : 'daily summary'}</b><br>${lines}${extra}`,
    };
  }

  if (setup === 'wp') {
    const move = 6.3;
    const html = {
      plain: `<b>${name} is up ${move.toFixed(1)}% in 24 hours</b><br>Now ${fmtPrice(price)}. That's more than the 5% move you asked to hear about.<p>The major coins overall are up 1.1%, so this move is mostly about ${name} itself.</p>`,
      standard: `<b>${coin} ${fmtPct(move)} in 24h</b><br>Now ${fmtPrice(price)}. Major coins +1.1%, so the move is mostly ${coin}-specific.`,
      compact: `<b>${coin} ${fmtPct(move)} · 24h</b><br>${fmtPrice(price)} · trigger ±5%`,
    }[level];
    return { tag: 'Watchlist Pulse · big move', time: '13:05', html };
  }

  const target = nicePrice(price * 1.05);
  const now = target * 1.0015;
  const html = {
    plain: `<b>${name} just went above ${fmtPrice(target)}</b><br>That's the level you set. It's now ${fmtPrice(now)}.<p>Want to set the next level? Send /levels.</p>`,
    standard: `<b>${coin} crossed above ${fmtPrice(target)}</b><br>Now ${fmtPrice(now)} · ${pct(2.3)} in 24h`,
    compact: `<b>${coin} ▲ ${fmtPrice(target)}</b><br>${fmtPrice(now)} · ${pct(2.3)} 24h`,
  }[level];
  return { tag: 'Price Level Alerts · level hit', time: '14:32', html };
}

export const bubble = (m: SampleMessage) =>
  `<div class="msg bot"><span class="msg-tag">${m.tag}</span>${m.html}<span class="msg-meta">Example · Binance spot · ${m.time}</span></div>`;
