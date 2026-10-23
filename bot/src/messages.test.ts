import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Level } from '@cryptopulse/shared';
import type { Ticker } from './binance';
import { levelAlert, moveAlert, settingsSummary, snapshot, summary, welcome } from './messages';

const time = { hour: 14, minute: 32, weekday: 5, dayKey: '2026-10-23' };
const sol: Ticker = { coin: 'SOL', price: 182.4, changePct: 6.3 };
const btc: Ticker = { coin: 'BTC', price: 110165, changePct: 2.3 };
const levels: Level[] = ['plain', 'standard', 'compact'];

/** Telegram rejects the whole message if a tag is left open, so every template is checked. */
function assertBalancedHtml(html: string) {
  for (const tag of ['b', 'i', 'code']) {
    const open = html.split(`<${tag}>`).length - 1;
    const close = html.split(`</${tag}>`).length - 1;
    assert.equal(open, close, `<${tag}> in: ${html}`);
  }
  assert.doesNotMatch(html, /<(?!\/?(b|i|code)>)/, 'only Telegram-supported tags');
}

test('every alert template is valid Telegram HTML at every explanation level', () => {
  for (const level of levels) {
    const c = { level, time, timeZone: 'Europe/Kyiv' };
    assertBalancedHtml(moveAlert(c, sol, 1.1, 5));
    assertBalancedHtml(levelAlert(c, btc, 'above', 110000));
    assertBalancedHtml(summary(c, [btc, sol], false, 3));
    assertBalancedHtml(summary(c, [btc, sol], true, 3));
    assertBalancedHtml(snapshot(c, [btc, sol]));
  }
});

test('explanation level changes the message, not just the wording', () => {
  const plain = moveAlert({ level: 'plain', time, timeZone: 'Europe/Kyiv' }, sol, 1.1, 5);
  const compact = moveAlert({ level: 'compact', time, timeZone: 'Europe/Kyiv' }, sol, 1.1, 5);
  assert.match(plain, /Solana is up 6\.3% in 24 hours/);
  assert.match(plain, /mostly about Solana itself/);
  assert.match(compact, /^<b>SOL \+6\.3% · 24h<\/b>/);
  assert.ok(compact.length < plain.length / 2);
});

test('every alert names its source and time', () => {
  assert.match(levelAlert({ level: 'standard', time, timeZone: 'Europe/Kyiv' }, btc, 'above', 110000), /Binance spot · 14:32 Kyiv/);
});

test('onboarding copy reflects the setup and the quiz', () => {
  assert.match(welcome('wp', true), /just taken the CryptoPulse quiz.*Watchlist Pulse/s);
  const s = settingsSummary(
    { setup: 'mb', level: 'plain', freq: 'weekly', coins: ['BTC', 'ETH'], moveThreshold: 10, summaryHour: 10, summaryWeekday: 0 },
    [], 'Europe/Kyiv',
  );
  assert.match(s, /Weekly recap on Sunday at 10:00, plus a heads-up on moves over ±10%/);
  assertBalancedHtml(s);
});
