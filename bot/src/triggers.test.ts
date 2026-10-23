import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isQuietHour, localTime, zoneLabel } from './time';
import { inferDirection, isBroadMove, levelHit, MOVE_COOLDOWN_MS, moveDue, summaryDue } from './triggers';

test('price levels fire on the right side only', () => {
  assert.equal(levelHit('above', 110000, 110001), true);
  assert.equal(levelHit('above', 110000, 109999), false);
  assert.equal(levelHit('below', 99500, 99400), true);
  assert.equal(levelHit('below', 99500, 99600), false);
});

test('typed levels get their direction from the current price', () => {
  assert.equal(inferDirection(110000, 104820), 'above');
  assert.equal(inferDirection(95000, 104820), 'below');
  assert.equal(inferDirection(104820, 104820), null);
  assert.equal(inferDirection(-1, 104820), null);
});

test('big moves respect the threshold, the cooldown and the daily cap', () => {
  const now = new Date('2026-10-23T12:00:00Z');
  const base = { changePct: -6.1, threshold: 5, lastSentAt: null, now, sentToday: 0, dailyCap: 5 };
  assert.equal(moveDue(base), true);
  assert.equal(moveDue({ ...base, changePct: 4.9 }), false);
  assert.equal(moveDue({ ...base, sentToday: 5 }), false);
  assert.equal(moveDue({ ...base, lastSentAt: new Date(now.getTime() - 60_000) }), false);
  assert.equal(moveDue({ ...base, lastSentAt: new Date(now.getTime() - MOVE_COOLDOWN_MS) }), true);
});

test('summaries go out once, at the chosen hour and weekday', () => {
  const sunday19 = { hour: 19, minute: 0, weekday: 0, dayKey: '2026-10-25' };
  assert.equal(summaryDue({ summaryHour: 19, summaryWeekday: null, lastSummaryKey: null }, sunday19), true);
  assert.equal(summaryDue({ summaryHour: 19, summaryWeekday: null, lastSummaryKey: '2026-10-25' }, sunday19), false);
  assert.equal(summaryDue({ summaryHour: 9, summaryWeekday: null, lastSummaryKey: null }, sunday19), false);
  assert.equal(summaryDue({ summaryHour: 19, summaryWeekday: 0, lastSummaryKey: '2026-10-18' }, sunday19), true);
  assert.equal(summaryDue({ summaryHour: 19, summaryWeekday: 0, lastSummaryKey: null }, { ...sunday19, weekday: 1 }), false);
  assert.equal(summaryDue({ summaryHour: null, summaryWeekday: null, lastSummaryKey: null }, sunday19), false);
});

test('a coin moving with the market counts as a broad move', () => {
  assert.equal(isBroadMove(-6, -4), true);
  assert.equal(isBroadMove(6.3, 1.1), false);
  assert.equal(isBroadMove(6, -3), false);
});

test('local time follows the configured zone', () => {
  // Tokyo has no daylight saving time: 21:30 UTC on a Friday is 06:30 on Saturday there.
  assert.deepEqual(localTime(new Date('2026-10-23T21:30:00Z'), 'Asia/Tokyo'), { hour: 6, minute: 30, weekday: 6, dayKey: '2026-10-24' });
  const t = localTime(new Date('2026-10-23T00:30:00Z'), 'UTC');
  assert.deepEqual(t, { hour: 0, minute: 30, weekday: 5, dayKey: '2026-10-23' });
  assert.equal(isQuietHour(t.hour), true);
  assert.equal(isQuietHour(12), false);
  assert.equal(isQuietHour(23), true);
  assert.equal(isQuietHour(8), false);
  assert.equal(zoneLabel('America/New_York'), 'New York');
});
