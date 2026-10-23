import { DAILY_MOVE_ALERT_CAP, type CoinId } from '@cryptopulse/shared';
import type { Ticker, TickerWindow } from './binance';
import type { Store, Subscriber } from './db';
import * as msg from './messages';
import { dayOfYear, isQuietHour, localTime, type LocalTime } from './time';
import { levelHit, marketChange, moveDue, summaryDue } from './triggers';

export interface MonitorDeps {
  store: Store;
  prices: (window?: TickerWindow) => Promise<Map<CoinId, Ticker>>;
  /** Resolves false when the message could not be delivered (for example, the user blocked the bot). */
  send: (chatId: number, html: string, silent: boolean) => Promise<boolean>;
  track: (chatId: number, name: string, props?: Record<string, unknown>) => void;
  timeZone: string;
}

type Kind = 'move' | 'level' | 'summary';

/**
 * One pass over every active subscriber: price levels, big moves, scheduled summaries.
 * Runs inside the bot process on a timer, so there is no separate cron or queue.
 */
export function createMonitor(d: MonitorDeps) {
  let running = false;

  async function deliver(user: Subscriber, kind: Kind, coin: CoinId | null, html: string, t: LocalTime): Promise<boolean> {
    // Quiet hours do not drop alerts: they arrive silently.
    const ok = await d.send(user.chatId, html, isQuietHour(t.hour));
    if (!ok) return false;
    d.store.logAlert(user.chatId, kind, coin, t.dayKey);
    if (d.store.markFirstAlert(user.chatId)) d.track(user.chatId, 'first_alert_delivered', { kind });
    return true;
  }

  async function checkUser(user: Subscriber, tickers: Map<CoinId, Ticker>, market: number, now: Date, t: LocalTime) {
    const ctx = { level: user.level, time: t, timeZone: d.timeZone };

    for (const level of d.store.openLevels(user.chatId)) {
      const ticker = tickers.get(level.coin);
      if (!ticker || !levelHit(level.direction, level.price, ticker.price)) continue;
      if (await deliver(user, 'level', level.coin, msg.levelAlert(ctx, ticker, level.direction, level.price), t)) {
        d.store.markLevelTriggered(level.id);
      }
    }

    if (user.moveThreshold != null) {
      for (const coin of user.coins) {
        const ticker = tickers.get(coin);
        if (!ticker) continue;
        const due = moveDue({
          changePct: ticker.changePct,
          threshold: user.moveThreshold,
          lastSentAt: d.store.lastMoveAlert(user.chatId, coin),
          now,
          sentToday: d.store.alertsOnDay(user.chatId, 'move', t.dayKey),
          dailyCap: DAILY_MOVE_ALERT_CAP,
        });
        if (due && (await deliver(user, 'move', coin, msg.moveAlert(ctx, ticker, market, user.moveThreshold), t))) {
          d.store.recordMoveAlert(user.chatId, coin);
        }
      }
    }

    if (summaryDue(user, t)) {
      const weekly = user.summaryWeekday != null;
      const source = weekly ? await d.prices('7d') : tickers;
      const mine = user.coins.map((c) => source.get(c)).filter((x): x is Ticker => Boolean(x));
      if (mine.length && (await deliver(user, 'summary', null, msg.summary(ctx, mine, weekly, dayOfYear(now)), t))) {
        d.store.setLastSummary(user.chatId, t.dayKey);
      }
    }
  }

  async function tick(now = new Date()) {
    if (running) return;
    running = true;
    try {
      const users = d.store.activeSubscribers();
      if (!users.length) return;
      const tickers = await d.prices('1d');
      const market = marketChange(tickers.values());
      const t = localTime(now, d.timeZone);
      for (const user of users) {
        try {
          await checkUser(user, tickers, market, now, t);
        } catch (err) {
          console.error(`monitor: user check failed: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      console.error(`monitor: tick skipped: ${(err as Error).message}`);
    } finally {
      running = false;
    }
  }

  return { tick };
}
