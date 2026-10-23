import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeSetupCode, type CoinId } from '@cryptopulse/shared';
import type { Ticker } from './binance';
import { Store } from './db';
import { draftFromChoice, settingsFromDraft } from './handlers';
import { createMonitor } from './monitor';

function setup(prices: Partial<Record<CoinId, [number, number]>>) {
  const store = new Store(':memory:');
  const sent: { chatId: number; html: string; silent: boolean }[] = [];
  const events: string[] = [];
  let current = prices;
  const monitor = createMonitor({
    store,
    timeZone: 'UTC',
    prices: async () => new Map(
      (Object.entries(current) as [CoinId, [number, number]][]).map(([coin, [price, changePct]]) => [coin, { coin, price, changePct } satisfies Ticker]),
    ),
    send: async (chatId, html, silent) => { sent.push({ chatId, html, silent }); return true; },
    track: (_chatId, name) => events.push(name),
  });
  return { store, sent, events, monitor, setPrices: (p: typeof prices) => { current = p; } };
}

// Friday noon in the bot's zone (UTC here): not quiet hours, not a summary hour.
const noon = new Date('2026-10-23T12:00:00Z');

test('the quiz code becomes working settings in the bot', () => {
  const choice = decodeSetupCode('wp-std-day-btc-sol_abcd12')!;
  const settings = settingsFromDraft({ ...draftFromChoice(choice, true), moveThreshold: 3 });
  assert.deepEqual(settings, {
    setup: 'wp', level: 'standard', freq: 'daily', coins: ['BTC', 'SOL'],
    moveThreshold: 3, summaryHour: 19, summaryWeekday: null,
  });
});

test('a big move alerts once, then waits for the cooldown', async () => {
  const { store, sent, events, monitor } = setup({ BTC: [104820, 1.2], SOL: [182.4, 6.3] });
  store.touchUser(1, 'wp-std-big-btc-sol_abcd12', 'abcd12');
  store.activate(1, { setup: 'wp', level: 'standard', freq: 'big', coins: ['BTC', 'SOL'], moveThreshold: 5, summaryHour: null, summaryWeekday: null }, null);

  await monitor.tick(noon);
  await monitor.tick(new Date(noon.getTime() + 60_000));

  assert.equal(sent.length, 1);
  assert.match(sent[0]!.html, /SOL \+6\.3% in 24h/);
  assert.equal(sent[0]!.silent, false);
  assert.deepEqual(events, ['first_alert_delivered']);
});

test('a price level fires once and is closed', async () => {
  const { store, sent, monitor, setPrices } = setup({ BTC: [104820, 1.2] });
  store.touchUser(2, null, null);
  store.activate(2, { setup: 'ta', level: 'compact', freq: 'instant', coins: ['BTC'], moveThreshold: null, summaryHour: null, summaryWeekday: null },
    [{ coin: 'BTC', direction: 'above', price: 110000 }]);

  await monitor.tick(noon);
  assert.equal(sent.length, 0);

  setPrices({ BTC: [110165, 2.3] });
  await monitor.tick(noon);
  await monitor.tick(noon);
  assert.equal(sent.length, 1);
  assert.match(sent[0]!.html, /BTC ▲ \$110,000/);
  assert.equal(store.openLevels(2).length, 0);
});

test('summaries arrive at the chosen hour, once per day; quiet hours make alerts silent', async () => {
  const { store, sent, monitor } = setup({ BTC: [104820, 1.2], ETH: [3912, -0.8] });
  store.touchUser(3, null, null);
  store.activate(3, { setup: 'mb', level: 'plain', freq: 'daily', coins: ['BTC', 'ETH'], moveThreshold: 10, summaryHour: 9, summaryWeekday: null }, null);

  const nine = new Date('2026-10-23T09:00:00Z');
  await monitor.tick(nine);
  await monitor.tick(new Date(nine.getTime() + 30 * 60_000));
  assert.equal(sent.length, 1);
  assert.match(sent[0]!.html, /Your daily summary/);
  assert.match(sent[0]!.html, /Term of the day/);

  const { store: s2, sent: sent2, monitor: m2 } = setup({ SOL: [160, -12] });
  s2.touchUser(4, null, null);
  s2.activate(4, { setup: 'wp', level: 'standard', freq: 'big', coins: ['SOL'], moveThreshold: 10, summaryHour: null, summaryWeekday: null }, null);
  await m2.tick(new Date('2026-10-23T01:00:00Z')); // inside quiet hours
  assert.equal(sent2.length, 1);
  assert.equal(sent2[0]!.silent, true);
});

test('paused users get nothing', async () => {
  const { store, sent, monitor } = setup({ SOL: [182.4, 6.3] });
  store.touchUser(5, null, null);
  store.activate(5, { setup: 'wp', level: 'standard', freq: 'big', coins: ['SOL'], moveThreshold: 5, summaryHour: null, summaryWeekday: null }, null);
  store.setPaused(5, true);
  await monitor.tick(noon);
  assert.equal(sent.length, 0);
});

test('the funnel counts unique users per step', () => {
  const store = new Store(':memory:');
  store.logEvent(1, 'bot_start', {});
  store.logEvent(1, 'bot_start', {});
  store.logEvent(2, 'bot_start', {});
  store.logEvent(1, 'monitoring_active', {});
  assert.deepEqual(store.funnel(['bot_start', 'monitoring_active']), [
    { name: 'bot_start', users: 2 },
    { name: 'monitoring_active', users: 1 },
  ]);
});
