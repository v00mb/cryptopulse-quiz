import type { Direction } from './db';
import type { Ticker } from './binance';
import type { LocalTime } from './time';

/** After a big-move alert for a coin, wait this long before alerting on the same coin again. */
export const MOVE_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export const levelHit = (direction: Direction, target: number, price: number) =>
  direction === 'above' ? price >= target : price <= target;

/** A level typed by the user points up or down from the current price. */
export function inferDirection(target: number, price: number): Direction | null {
  if (!Number.isFinite(target) || target <= 0 || target === price) return null;
  return target > price ? 'above' : 'below';
}

export function moveDue(o: {
  changePct: number;
  threshold: number;
  lastSentAt: Date | null;
  now: Date;
  sentToday: number;
  dailyCap: number;
}): boolean {
  if (Math.abs(o.changePct) < o.threshold) return false;
  if (o.sentToday >= o.dailyCap) return false;
  return !o.lastSentAt || o.now.getTime() - o.lastSentAt.getTime() >= MOVE_COOLDOWN_MS;
}

export function summaryDue(
  s: { summaryHour: number | null; summaryWeekday: number | null; lastSummaryKey: string | null },
  t: LocalTime,
): boolean {
  if (s.summaryHour == null || t.hour !== s.summaryHour) return false;
  if (s.summaryWeekday != null && t.weekday !== s.summaryWeekday) return false;
  return s.lastSummaryKey !== t.dayKey;
}

/** Average 24h change of the major coins, used as "the market" for context. */
export function marketChange(tickers: Iterable<Ticker>): number {
  const all = [...tickers];
  return all.length ? all.reduce((sum, t) => sum + t.changePct, 0) / all.length : 0;
}

/** True when the coin moves with the market rather than on its own. */
export const isBroadMove = (changePct: number, market: number) =>
  Math.sign(changePct) === Math.sign(market) && Math.abs(market) >= Math.abs(changePct) / 2;
