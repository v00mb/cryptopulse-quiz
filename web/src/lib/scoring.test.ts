import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeSetupCode } from '@cryptopulse/shared';
import { buildProfile, computeScores, MAX_SCORE, topReasons, type Answers } from './scoring';

const casual: Answers = {
  goal: ['hold'], exp: ['basics'], data: ['moves'], freq: ['big'], value: ['noapp'],
  coins: ['ETH', 'BTC'], worry: ['spam'],
};

test('a casual follower gets Watchlist Pulse with weighted points', () => {
  const s = computeScores(casual);
  assert.equal(s.best, 'wp');
  assert.deepEqual(s.scores, { mb: 0, wp: 17, ta: 0 });
});

test('the max score matches the strongest possible answer set', () => {
  assert.equal(MAX_SCORE, 18);
});

test('ties go to the simpler setup', () => {
  // goal "curious" gives Basics +3 and Pulse +3, nothing else answered.
  assert.equal(computeScores({ goal: ['curious'] }).best, 'mb');
});

test('motivation outweighs a single contrary answer', () => {
  const s = computeScores({ goal: ['react'], exp: ['none'], freq: ['weekly'] });
  assert.equal(s.best, 'ta'); // Levels 6 vs Basics 4
});

test('the concern question never changes the score', () => {
  const a = computeScores({ ...casual, worry: ['spam'] }).scores;
  const b = computeScores({ ...casual, worry: ['keys'] }).scores;
  assert.deepEqual(a, b);
});

test('profile sets details from specific answers and encodes them for the bot', () => {
  const p = buildProfile(casual, null, 'abcd12');
  assert.equal(p.level, 'standard');
  assert.equal(p.focus, 'moves');
  assert.equal(p.freq, 'big');
  assert.deepEqual(p.coins, ['BTC', 'ETH']);
  assert.equal(p.code, 'wp-std-big-btc-eth_abcd12');
  assert.deepEqual(decodeSetupCode(p.code), { setup: 'wp', level: 'standard', freq: 'big', coins: ['BTC', 'ETH'], session: 'abcd12' });
});

test('"not sure" coins fall back to the setup defaults', () => {
  const p = buildProfile({ ...casual, coins: ['unsure'] }, null);
  assert.equal(p.coinsFromQuiz, false);
  assert.deepEqual(p.coins, ['BTC', 'ETH', 'SOL']);
});

test('a manual switch keeps the answers but changes the setup', () => {
  const p = buildProfile(casual, 'ta');
  assert.equal(p.setupId, 'ta');
  assert.equal(p.scores.best, 'wp');
});

test('reasons are ranked by weight', () => {
  const reasons = topReasons(computeScores(casual), 'wp');
  assert.deepEqual(reasons.map((r) => r.q.id), ['goal', 'data', 'value']);
});
