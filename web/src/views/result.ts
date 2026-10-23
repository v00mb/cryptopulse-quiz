import { FREQS, LEVELS, SETUP_IDS, SETUPS } from '@cryptopulse/shared';
import { FOCUS, WORRY } from '../config/quiz';
import { fmtNum } from '../lib/format';
import { bubble, sampleMessage } from '../lib/messages';
import { topReasons, type Profile } from '../lib/scoring';
import { chatHead, ICON } from './icons';

export function telegramLink(botUsername: string | undefined, code: string) {
  return botUsername ? `https://t.me/${botUsername}?start=${code}` : null;
}

function reasonsHTML(p: Profile, overridden: boolean) {
  if (overridden) {
    return `<li><span class="r-k">Your choice</span><span>You switched from ${SETUPS[p.scores.best].name}, your quiz match. Coins, delivery and explanations stay tuned to your answers.</span></li>`;
  }
  return topReasons(p.scores, p.setupId).map((r) => `
    <li>
      <span class="r-k">${r.q.reason}</span>
      <q>${r.labels.join(', ')}</q>
      <span class="pts">+${fmtNum(r.value)} ${p.setup.short} · Q${r.q.n} ×${r.q.weight}</span>
    </li>`).join('');
}

export function viewResult(p: Profile, overridden: boolean, link: string | null) {
  const S = p.setup;
  const row = (k: string, v: string, src: string) => `<dt>${k}</dt><dd>${v}<span class="src n-only">← ${src}</span></dd>`;
  const coins = `<span class="coinchips">${p.coins.map((c) => `<span>${c}</span>`).join('')}</span>`;
  const others = SETUP_IDS.filter((k) => k !== p.setupId);

  const cta = link
    ? `<a class="btn-signal btn-lg" data-act="cta" href="${link}" target="_blank" rel="noopener">Open my setup in Telegram ${ICON.arrow}</a>`
    : `<button type="button" class="btn-signal btn-lg" disabled>Open my setup in Telegram ${ICON.arrow}</button>
       <p class="cta-fine">The bot username is not configured. Set <code>VITE_BOT_USERNAME</code> and rebuild.</p>`;

  return `
  <div class="result">
    <div class="rhead">
      <p class="eyebrow">${overridden ? 'The setup you picked' : 'Your setup'}</p>
      <h2 class="rtitle" id="screen-title" tabindex="-1">${S.name}</h2>
      <p class="lede">${S.tagline}</p>
    </div>
    <div class="rgrid">
      <div class="rmain">
        <section class="panel" aria-label="What you'll get">
          <h3 class="ph">What you'll get</h3>
          <dl class="spec">
            ${row('Coins', coins, p.coinsFromQuiz ? 'Q6' : 'setup default')}
            ${row('Trigger', S.trigger, 'setup')}
            ${row('Delivery', FREQS[p.freq].label, 'Q4')}
            ${row('Explanations', LEVELS[p.level].label, 'Q2')}
            ${row('Main feature', FOCUS[p.focus], 'Q3')}
          </dl>
          ${S.roadmap ? `<p class="fine">${S.roadmap}</p>` : ''}
        </section>
        <section class="panel" aria-label="Why this setup">
          <h3 class="ph">Why this setup</h3>
          <ul class="reasons">${reasonsHTML(p, overridden)}</ul>
        </section>
      </div>
      <aside class="rside">
        <p class="vis-label">Preview of a message · example</p>
        <div class="chat">${chatHead('bot')}<div class="chat-log">${bubble(sampleMessage(p.setupId, p.coins, p.level, p.freq))}</div></div>
      </aside>
    </div>
    <section class="reassure">${ICON.shield}<div><b>${WORRY[p.worry].title}</b>${WORRY[p.worry].text}<span class="src n-only">← Q7</span></div></section>
    <section class="cta-panel">
      <div>
        <h3>Switch it on in Telegram</h3>
        <ol class="next">
          <li>Open the CryptoPulse bot. Your setup loads automatically.</li>
          <li>Confirm which coins to watch.</li>
          <li>${S.step3}</li>
          <li>The bot switches monitoring on and shows where your coins are right now.</li>
        </ol>
      </div>
      <div class="cta-act">
        ${cta}
        <p class="cta-fine">No exchange login or API keys. The link carries only a setup code, <code>${p.code}</code>, with no name, email or wallet.</p>
        ${link ? `<div class="qr-wrap"><div class="qr" id="qr" aria-hidden="true"></div><p class="cta-fine">On a computer? Scan to continue on your phone.</p></div>` : ''}
      </div>
    </section>
    <div class="alt">
      <span>Not quite you?</span>
      ${others.map((k) => `<button type="button" class="chip-btn" data-act="switch" data-s="${k}">See ${SETUPS[k].name}</button>`).join('')}
      ${overridden ? '<button type="button" class="chip-btn" data-act="switch" data-s="">Back to my match</button>' : ''}
      <button type="button" class="link-btn" data-act="retake">Retake the quiz</button>
    </div>
  </div>`;
}
