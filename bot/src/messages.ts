import { COINS, fmtPct, fmtPrice, FREQS, LEVELS, SETUPS, type CoinId, type Level, type SetupId } from '@cryptopulse/shared';
import type { Ticker } from './binance';
import type { Direction, PriceLevel, Settings } from './db';
import { isBroadMove } from './triggers';
import { clock, zoneLabel, type LocalTime } from './time';

/** All bot copy. Telegram HTML parse mode; every dynamic value here is a number or our own constant. */

export interface MsgContext { level: Level; time: LocalTime; timeZone: string }

const name = (coin: CoinId, level: Level) => (level === 'compact' ? coin : COINS[coin].name);
const source = (c: MsgContext) => `\n\n<i>Binance spot · ${clock(c.time)} ${zoneLabel(c.timeZone)}</i>`;
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TERMS = [
  ['Volatility', 'how much a price swings. Daily moves of 2–5% are normal in crypto.'],
  ['Market cap', 'price × number of coins in circulation. It shows how big a coin is, not how expensive one coin is.'],
  ['Stablecoin', 'a coin meant to stay at $1, like USDT. Prices on CryptoPulse are quoted in it.'],
  ['24h change', 'the difference between the price now and exactly 24 hours ago.'],
  ['Spot price', 'the price you could buy or sell at right now, as opposed to futures or bets on later prices.'],
  ['Altcoin', 'any coin other than Bitcoin.'],
  ['Liquidity', 'how easily a coin can be bought or sold without moving its price much.'],
] as const;

export function moveAlert(c: MsgContext, t: Ticker, market: number, threshold: number) {
  const n = t.coin;
  const broad = isBroadMove(t.changePct, market);
  const dir = t.changePct >= 0 ? 'up' : 'down';
  const body = {
    plain:
      `<b>${COINS[t.coin].name} is ${dir} ${Math.abs(t.changePct).toFixed(1)}% in 24 hours</b>\n` +
      `Now ${fmtPrice(t.price)}. That's more than the ${threshold}% move you asked to hear about.\n\n` +
      (broad
        ? `The major coins are moving the same way (${fmtPct(market)} on average), so this is a market-wide move rather than something about ${COINS[t.coin].name}.`
        : `The major coins moved ${fmtPct(market)} on average, so this move is mostly about ${COINS[t.coin].name} itself.`) +
      '\nThis is information, not advice.',
    standard:
      `<b>${n} ${fmtPct(t.changePct)} in 24h</b>\nNow ${fmtPrice(t.price)}. Major coins ${fmtPct(market)}, ` +
      (broad ? 'so it is a market-wide move.' : `so the move is mostly ${n}-specific.`),
    compact: `<b>${n} ${fmtPct(t.changePct)} · 24h</b>\n${fmtPrice(t.price)} · market ${fmtPct(market)} · trigger ±${threshold}%`,
  }[c.level];
  return body + source(c);
}

export function levelAlert(c: MsgContext, t: Ticker, direction: Direction, target: number) {
  const body = {
    plain:
      `<b>${COINS[t.coin].name} just went ${direction} ${fmtPrice(target)}</b>\n` +
      `That's the level you set. It's now ${fmtPrice(t.price)} (${fmtPct(t.changePct)} in 24 hours).\n\n` +
      'Want to set the next level? Send /levels.',
    standard: `<b>${t.coin} crossed ${direction} ${fmtPrice(target)}</b>\nNow ${fmtPrice(t.price)} · ${fmtPct(t.changePct)} in 24h\nNext level: /levels`,
    compact: `<b>${t.coin} ${direction === 'above' ? '▲' : '▼'} ${fmtPrice(target)}</b>\n${fmtPrice(t.price)} · ${fmtPct(t.changePct)} 24h`,
  }[c.level];
  return body + source(c);
}

export function summary(c: MsgContext, tickers: Ticker[], weekly: boolean, dayIndex: number) {
  const span = weekly ? 'week' : 'day';
  const lines = tickers.map((t) => `${name(t.coin, c.level)} ${fmtPrice(t.price)} (${fmtPct(t.changePct)})`).join('\n');
  const biggest = tickers.reduce<Ticker | null>((a, t) => (!a || Math.abs(t.changePct) > Math.abs(a.changePct) ? t : a), null);
  const calmLimit = weekly ? 4 : 2;
  const normalLimit = weekly ? 10 : 5;

  let mood = '';
  if (biggest) {
    const move = Math.abs(biggest.changePct);
    mood = move < calmLimit
      ? `A calm ${span}: your coins moved less than ${calmLimit}%.`
      : move < normalLimit
        ? `A normal ${span} for crypto: moves of ${calmLimit}–${normalLimit}% are common.`
        : `A lively ${span}: ${COINS[biggest.coin].name} moved ${fmtPct(biggest.changePct)}.`;
  }
  const [term, meaning] = TERMS[dayIndex % TERMS.length]!;
  const extra = {
    plain: `\n\n${mood}\n\n<b>Term of the ${span}:</b> ${lowerFirst(term)} means ${meaning}`,
    standard: mood ? `\n\n${mood}` : '',
    compact: '',
  }[c.level];
  const title = weekly ? 'Your weekly recap (7-day change)' : 'Your daily summary (24h change)';
  return `<b>${title}</b>\n${lines}${extra}` + source(c);
}

export function snapshot(c: MsgContext, tickers: Ticker[]) {
  const lines = tickers.map((t) => `${name(t.coin, c.level)}: ${fmtPrice(t.price)} · ${fmtPct(t.changePct)} in 24h`).join('\n');
  const hint = c.level === 'plain' ? '\n\nThe percentage is the change over the last 24 hours. I will tell you when something worth knowing happens.' : '';
  return `<b>Here's where your coins are right now</b>\n${lines}${hint}` + source(c);
}

/* onboarding copy */

export function welcome(setup: SetupId, fromQuiz: boolean) {
  const s = SETUPS[setup];
  const intro = fromQuiz ? "Hi! You've just taken the CryptoPulse quiz." : 'Hi! I am CryptoPulse.';
  return `${intro} Your suggested setup is <b>${s.name}</b>: ${lowerFirst(s.tagline)}\n\nLet's switch it on. It takes about 30 seconds.`;
}

export function noCodeWelcome(webUrl: string) {
  const quiz = webUrl ? `The quickest way to a good setup is the 1-minute quiz: ${escapeHtml(webUrl)}\n\n` : '';
  return `Hi! I am CryptoPulse. I watch the crypto market for you and message you only when it matters.\n\n${quiz}Or pick a setup right here:`;
}

export const setupPitch = (setup: SetupId) => `<b>${SETUPS[setup].name}</b>: ${lowerFirst(SETUPS[setup].tagline)}`;

export function triggerLine(s: Pick<Settings, 'setup' | 'moveThreshold' | 'summaryHour' | 'summaryWeekday'>) {
  const at = s.summaryHour == null ? '' : `${String(s.summaryHour).padStart(2, '0')}:00`;
  if (s.setup === 'mb') {
    const when = s.summaryWeekday == null ? `Daily summary at ${at}` : `Weekly recap on Sunday at ${at}`;
    return `${when}, plus a heads-up on moves over ±${s.moveThreshold ?? 10}%`;
  }
  if (s.setup === 'wp') return `Alert on moves over ±${s.moveThreshold ?? 5}% in 24h`;
  return 'Alerts at your price levels';
}

export function deliveryLine(s: Pick<Settings, 'setup' | 'freq' | 'summaryHour' | 'summaryWeekday'>) {
  if (s.setup === 'mb') return null; // the summary time already says it
  if (s.summaryHour == null) return FREQS[s.freq].label;
  const at = `${String(s.summaryHour).padStart(2, '0')}:00`;
  return s.summaryWeekday == null ? `Alerts plus a short summary at ${at}` : `Alerts plus a recap on Sunday at ${at}`;
}

export const levelLine = (l: Pick<PriceLevel, 'coin' | 'direction' | 'price'>) => `${l.coin} ${l.direction} ${fmtPrice(l.price)}`;

export function settingsSummary(s: Settings, levels: Pick<PriceLevel, 'coin' | 'direction' | 'price'>[], timeZone: string) {
  const items = [
    `Coins: ${s.coins.join(', ')}`,
    triggerLine(s),
    deliveryLine(s),
    levels.length ? `Price levels: ${levels.map(levelLine).join('; ')}` : null,
    `Explanations: ${lowerFirst(LEVELS[s.level].label)}`,
    `Quiet hours: 23:00–08:00 ${zoneLabel(timeZone)} time (alerts arrive silently)`,
  ].filter(Boolean);
  return `<b>${SETUPS[s.setup].name}</b>\n${items.map((i) => `• ${i}`).join('\n')}`;
}

export const activated = () =>
  "<b>Done. Monitoring is on.</b>\nI'll message you when something on your list happens. Change anything with /settings, pause with /pause, add price levels with /levels.\n\n<i>Market data only. Not financial advice.</i>";

export const HELP =
  '<b>CryptoPulse commands</b>\n' +
  '/settings: change coins, triggers or setup\n' +
  '/status: what I am watching for you\n' +
  '/levels: add or clear price levels\n' +
  '/pause and /resume: stop or restart alerts\n\n' +
  '<i>Market data from the public Binance spot market. Not financial advice.</i>';
