import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeSetupCode, encodeSetupCode, START_PARAM_MAX } from './setupCode';

test('encodes a setup into a short start parameter', () => {
  const code = encodeSetupCode({ setup: 'wp', level: 'standard', freq: 'big', coins: ['ETH', 'BTC'], session: 'k3f9x2' });
  assert.equal(code, 'wp-std-big-btc-eth_k3f9x2');
});

test('round-trips every field', () => {
  const choice = { setup: 'ta', level: 'compact', freq: 'instant', coins: ['BTC', 'DOGE'], session: 'abcd12' } as const;
  assert.deepEqual(decodeSetupCode(encodeSetupCode({ ...choice, coins: [...choice.coins] })), { ...choice, coins: ['BTC', 'DOGE'] });
});

test('longest possible code fits the Telegram limit', () => {
  const code = encodeSetupCode({
    setup: 'ta', level: 'standard', freq: 'weekly',
    coins: ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE'], session: 'abcdefghijkl',
  });
  assert.ok(code.length <= START_PARAM_MAX, `${code.length} chars`);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
});

test('falls back to the setup default coins when none are known', () => {
  assert.deepEqual(decodeSetupCode('mb-pln-day')?.coins, ['BTC', 'ETH']);
  assert.deepEqual(decodeSetupCode('mb-pln-day-pepe')?.coins, ['BTC', 'ETH']);
});

test('rejects malformed or foreign payloads', () => {
  for (const bad of ['', 'hello', 'xx-std-big-btc', 'wp-zzz-big-btc', 'wp-std-zzz-btc', 'wp std', 'a'.repeat(65)]) {
    assert.equal(decodeSetupCode(bad), null, bad);
  }
});

test('rejects characters Telegram would not pass, and drops a malformed session', () => {
  assert.equal(decodeSetupCode('wp-std-big-btc_!!'), null);
  assert.equal(decodeSetupCode('constructor-std-big-btc'), null);
  const choice = decodeSetupCode('wp-std-big-btc_ab');
  assert.equal(choice?.setup, 'wp');
  assert.equal(choice?.session, undefined);
});
