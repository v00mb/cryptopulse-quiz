import { SETUP_IDS, SETUPS } from '@cryptopulse/shared';
import { QUESTIONS, type Option, type Question } from '../config/quiz';
import { fmtNum } from '../lib/format';
import type { Answers } from '../lib/scoring';
import { ICON } from './icons';

export const KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

/** What an answer does, shown on the option when reviewer notes are on. */
export function pointsLabel(q: Question, o: Option) {
  const parts: string[] = [];
  for (const s of SETUP_IDS) {
    const raw = o.pts?.[s];
    if (raw) parts.push(`${SETUPS[s].short} +${fmtNum(raw * q.weight)}`);
  }
  if (o.level) parts.push(`explanations: ${o.level}`);
  if (o.focus) parts.push(`feature: ${o.focus}`);
  if (q.id === 'freq') parts.push(`delivery: ${o.id}`);
  if (q.id === 'worry') parts.push(`reassurance: ${o.id}`);
  if (q.id === 'coins') parts.push(o.pts ? 'default coins' : 'adds to watchlist');
  return parts.join(' · ') || 'no points';
}

export function viewQuestion(index: number, answers: Answers) {
  const q = QUESTIONS[index]!;
  const selected = answers[q.id] ?? [];
  const progress = QUESTIONS.map((_, i) => `<span class="${i < index ? 'done' : i === index ? 'now' : ''}"></span>`).join('');
  const options = q.options.map((o, i) => `
    <button type="button" class="opt ${o.exclusive ? 'opt--wide' : ''}" data-act="opt" data-o="${o.id}" aria-pressed="${selected.includes(o.id)}">
      <span class="key" aria-hidden="true">${KEYS[i]}</span>
      <span class="opt-l">${o.label}${o.sub ? `<small>${o.sub}</small>` : ''}</span>
      <span class="pts">${pointsLabel(q, o)}</span>
    </button>`).join('');

  return `
  <div class="qcard">
    <div class="qtop">
      <button type="button" class="link-btn" data-act="back">← ${index === 0 ? 'Home' : 'Back'}</button>
      <span class="qcount">Question ${index + 1} of ${QUESTIONS.length}</span>
    </div>
    <div class="progress" aria-hidden="true">${progress}</div>
    <h2 class="qtitle" id="screen-title" tabindex="-1">${q.title}</h2>
    ${q.hint ? `<p class="qhint">${q.hint}</p>` : ''}
    <div class="opts ${q.multi ? 'opts--coins' : ''}" role="group" aria-labelledby="screen-title">${options}</div>
    ${q.multi ? `<div class="qfoot"><button type="button" class="btn-signal" data-act="continue" ${selected.length ? '' : 'disabled'}>Continue ${ICON.arrow}</button><span class="qhint">Or press Enter</span></div>` : ''}
  </div>`;
}
