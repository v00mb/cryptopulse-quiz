import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchTickers, parseTickers, STALE_MS } from './binance';

const now = Date.parse('2026-10-23T12:00:00Z');
const row = (symbol: string, lastPrice: string, pct: string, closeTime = now, count = 100) =>
  ({ symbol, lastPrice, priceChangePercent: pct, closeTime, count });

test('parses known pairs and skips halted or stale ones', () => {
  const map = parseTickers([
    row('BTCUSDT', '104820.5', '-3.4'),
    row('ETHUSDT', '0.00000000', '0', now, 0), // no trades in the window
    row('SOLUSDT', '182.4', '6.3', now - STALE_MS - 1), // halted pair, old window
    row('FOOUSDT', '1', '1'),
  ], now);
  assert.deepEqual([...map.keys()], ['BTC']);
  assert.deepEqual(map.get('BTC'), { coin: 'BTC', price: 104820.5, changePct: -3.4 });
});

test('falls back to the second host when the first one is blocked', async () => {
  const hosts: string[] = [];
  const fakeFetch = (async (url: string | URL | Request) => {
    const u = String(url);
    hosts.push(new URL(u).host);
    if (u.startsWith('https://data-api.binance.vision')) return new Response('restricted', { status: 451 });
    return Response.json([row('BTCUSDT', '1', '1', Date.now())]);
  }) as typeof fetch;
  const map = await fetchTickers('https://data-api.binance.vision', '1d', fakeFetch);
  assert.deepEqual(hosts, ['data-api.binance.vision', 'api.binance.com']);
  assert.equal(map.get('BTC')?.price, 1);
});

test('reports every host when all fail', async () => {
  const failing = (async () => new Response('', { status: 503 })) as typeof fetch;
  await assert.rejects(fetchTickers('https://data-api.binance.vision', '1d', failing), /HTTP 503.*HTTP 503/);
});
