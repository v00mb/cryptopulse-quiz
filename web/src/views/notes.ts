import { SETUPS } from '@cryptopulse/shared';
import { QUESTIONS } from '../config/quiz';
import type { TrackedEvent } from '../lib/analytics';
import type { Profile, Scores } from '../lib/scoring';
import { scoreBars } from './scoreBars';

export type Screen = 'landing' | 'quiz' | 'building' | 'result';

export interface NotesContext {
  screen: Screen;
  questionIndex: number;
  scores: Scores;
  profile: Profile | null;
  overridden: boolean;
  link: string | null;
}

/** Margin notes for reviewers of the test task: what each screen learns and why. */
export function viewNotes(c: NotesContext) {
  let html = '';
  if (c.screen === 'landing') {
    html += `<div class="note"><h4>Reviewer note · first screen</h4>
      <p><b>Quiz-first.</b> The CTA starts the quiz right here, with no long landing page before it.</p>
      <p><span class="hyp">Hypothesis</span>A concrete result (“your setup”) gets more starts than a generic “sign up”. To be tested against a classic landing.</p>
      <p>The headline covers both MVP segments: understanding the market, and not having to watch it.</p>
      <p>The trust line rules out exchange logins, API keys and deposits before anyone has to ask.</p></div>`;
  } else if (c.screen === 'quiz') {
    const q = QUESTIONS[c.questionIndex]!;
    html += `<div class="note"><h4>Question ${q.n}${q.added ? ' · added to the original 5' : ''}</h4>
      <dl class="ndl"><dt>Learns</dt><dd>${q.learn}</dd><dt>Used for</dt><dd>${q.use}</dd><dt>Weight</dt><dd>×${q.weight}</dd></dl>
      <p class="muted">Points on each answer are already multiplied by the weight.</p></div>
      <div class="note"><h4>Running totals</h4>${scoreBars(c.scores.scores, c.scores.best, 'static')}</div>`;
  } else if (c.screen === 'building') {
    html += `<div class="note"><h4>Final totals</h4>${scoreBars(c.scores.scores, c.scores.best, 'static')}
      <p>These are the real scores. The short pause shows the user that their answers are being used.</p></div>`;
  } else if (c.profile) {
    const p = c.profile;
    html += `<div class="note"><h4>Scores</h4>${scoreBars(p.scores.scores, p.scores.best, 'static')}
      <p>Highest weighted total wins. Ties go to the simpler setup.${c.overridden ? ` The user switched away from ${SETUPS[p.scores.best].name}, logged as <code>result_setup_switched</code>.` : ''}</p></div>
      <div class="note"><h4>Where each block comes from</h4><ul class="nlist">
        <li>Setup: weighted total of Q1–Q6</li><li>Coins: Q6</li><li>Delivery: Q4</li>
        <li>Explanations and preview tone: Q2</li><li>Main feature: Q3</li><li>Reassurance: Q7</li></ul></div>
      <div class="note"><h4>Deep link</h4><code>${c.link ?? `t.me/&lt;bot&gt;?start=${p.code}`}</code>
        <p>${p.code.length} of 64 characters: setup, explanation level, delivery, coins and an anonymous quiz session id. The bot logs the same id, so web and bot events join without personal data.</p></div>`;
  }
  return html + '<div class="note"><h4>Analytics events</h4><ol class="evlog" id="evlog"></ol></div>';
}

export function viewEventLog(events: readonly TrackedEvent[]) {
  const time = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const props = (p: TrackedEvent['props']) => Object.entries(p).map(([k, v]) => `${k}=${v}`).join(' ');
  return events.slice(-8).reverse().map((e) =>
    `<li><span class="ev-t">${time(e.t)}</span><code>${e.name}</code>${Object.keys(e.props).length ? `<span class="ev-p">${props(e.props)}</span>` : ''}</li>`,
  ).join('') || '<li class="muted">No events yet</li>';
}
