import { pct } from '../lib/format';
import type { FeedItem } from '../lib/market';
import { bubble } from '../lib/messages';
import { chatHead, ICON } from './icons';

export function feedRows(feed: FeedItem[]) {
  const half = Math.ceil(feed.length / 2);
  const row = (items: FeedItem[]) => {
    const s = items.map((i) => `<span class="tk"><b>${i.symbol}</b>${pct(i.change)}</span>`).join('');
    return `<div class="noise-row"><div class="noise-track">${s}${s}</div></div>`;
  };
  return row(feed.slice(0, half)) + row(feed.slice(half));
}

export function viewLanding(feed: FeedItem[], live: boolean) {
  return `
  <div class="landing">
    <div class="hero-copy">
      <p class="eyebrow">Crypto market alerts in Telegram</p>
      <h1 class="display" id="screen-title" tabindex="-1">Follow crypto without <em>watching charts</em> all day</h1>
      <p class="lede">Answer 7 quick questions and get a monitoring setup that fits you: which coins to watch, which signals matter, and how often to hear from us.</p>
      <div class="cta-row">
        <button type="button" class="btn-signal btn-lg" data-act="start">Find my setup ${ICON.arrow}</button>
        <span class="cta-meta">${ICON.clock} About 1 minute</span>
      </div>
      <ul class="assure">
        <li>${ICON.check}No exchange login or API keys</li>
        <li>${ICON.check}No deposits or payments</li>
        <li>${ICON.check}No email needed to see your result</li>
      </ul>
    </div>
    <div class="hero-visual">
      <div class="noise" aria-hidden="true">
        <p class="vis-label" id="feed-label">${feedLabel(live)}</p>
        <div id="feed">${feedRows(feed)}</div>
      </div>
      <p class="vis-label vis-label--signal">What reaches your Telegram instead</p>
      <div class="chat" role="img" aria-label="Three example CryptoPulse messages in Telegram">
        ${chatHead('bot · example messages')}
        <div class="chat-log">
          ${bubble({ tag: 'Market Basics · daily summary', time: '09:00', html: `Bitcoin $104,820 ${pct(1.2)}, Ethereum $3,912 ${pct(-0.8)}. A calm day: most big coins moved less than 2%.` })}
          ${bubble({ tag: 'Watchlist Pulse · big move', time: '13:05', html: '<b>SOL +6.3% in 24h</b>, now $182.40. The major coins overall are up 1.1%, so this move is mostly about Solana.' })}
          ${bubble({ tag: 'Price Level Alerts · level hit', time: '14:32', html: '<b>BTC crossed above $105,000</b><br>Now $105,140' })}
        </div>
      </div>
    </div>
  </div>`;
}

export const feedLabel = (live: boolean) =>
  live ? 'The market feed · 24h change · live from Binance' : 'The market feed · 24h change · sample';
