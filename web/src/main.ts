import './styles.css';
import QRCode from 'qrcode';
import type { SetupId } from '@cryptopulse/shared';
import { QUESTIONS } from './config/quiz';
import { onEvents, session, track } from './lib/analytics';
import { fetchLiveFeed, SAMPLE_FEED, type FeedItem } from './lib/market';
import { buildProfile, computeScores, type Answers } from './lib/scoring';
import { feedLabel, feedRows, viewLanding } from './views/landing';
import { viewEventLog, viewNotes, type Screen } from './views/notes';
import { KEYS, viewQuestion } from './views/question';
import { telegramLink, viewResult } from './views/result';
import { viewBuilding } from './views/scoreBars';

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME?.replace(/^@/, '').trim() || undefined;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const store = {
  get(key: string) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* ignore */ } },
};

const state = {
  screen: 'landing' as Screen,
  q: 0,
  answers: {} as Answers,
  override: null as SetupId | null,
  notes: store.get('cp-notes') !== '0',
  feed: SAMPLE_FEED as FeedItem[],
  feedLive: false,
};

const stage = document.getElementById('stage')!;
const notesEl = document.getElementById('notes')!;
const notesSwitch = document.getElementById('notes-switch') as HTMLInputElement;

let advancing = false;
let buildTimer: number | undefined;
let firstRender = true;

const currentProfile = () => buildProfile(state.answers, state.override, session);

/* ---------- render ---------- */

function render() {
  const scores = computeScores(state.answers);
  if (state.screen === 'landing') stage.innerHTML = viewLanding(state.feed, state.feedLive);
  else if (state.screen === 'quiz') stage.innerHTML = viewQuestion(state.q, state.answers);
  else if (state.screen === 'building') stage.innerHTML = viewBuilding(scores.scores, scores.best);
  else {
    const p = currentProfile();
    stage.innerHTML = viewResult(p, state.override !== null, telegramLink(BOT_USERNAME, p.code));
    void drawQr(telegramLink(BOT_USERNAME, p.code));
  }
  renderNotes();

  if (!firstRender) {
    document.getElementById('screen-title')?.focus({ preventScroll: true });
    if (stage.getBoundingClientRect().top < 60) stage.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  firstRender = false;
}

function renderNotes() {
  document.body.classList.toggle('notes-on', state.notes);
  notesEl.hidden = !state.notes;
  if (!state.notes) return;
  const profile = state.screen === 'result' ? currentProfile() : null;
  notesEl.innerHTML = viewNotes({
    screen: state.screen,
    questionIndex: state.q,
    scores: computeScores(state.answers),
    profile,
    overridden: state.override !== null,
    link: profile ? telegramLink(BOT_USERNAME, profile.code) : null,
  });
  renderEventLog();
}

let lastEvents: Parameters<typeof viewEventLog>[0] = [];
function renderEventLog() {
  const el = document.getElementById('evlog');
  if (el) el.innerHTML = viewEventLog(lastEvents);
}
onEvents((events) => { lastEvents = events; renderEventLog(); });

async function drawQr(link: string | null) {
  const el = document.getElementById('qr');
  if (!el || !link) return;
  try {
    el.innerHTML = await QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  } catch {
    el.parentElement?.remove();
  }
}

/* ---------- quiz flow ---------- */

function startQuiz() {
  state.screen = 'quiz';
  state.q = 0;
  render();
  track('quiz_start');
}

function next() {
  if (state.q < QUESTIONS.length - 1) {
    state.q++;
    render();
  } else {
    finishQuiz();
  }
}

function back() {
  if (state.q === 0) state.screen = 'landing';
  else state.q--;
  render();
}

function finishQuiz() {
  state.override = null;
  const { best } = computeScores(state.answers);
  state.screen = 'building';
  render();
  track('quiz_complete', { setup: best });
  window.setTimeout(() => stage.querySelector('.sbars')?.classList.add('go'), 40);
  window.clearTimeout(buildTimer);
  buildTimer = window.setTimeout(() => {
    if (state.screen !== 'building') return;
    state.screen = 'result';
    render();
    track('result_view', { setup: best });
  }, reduceMotion ? 700 : 1800);
}

function choose(optionId: string) {
  const q = QUESTIONS[state.q]!;
  if (q.multi) {
    const option = q.options.find((o) => o.id === optionId);
    let selected = new Set(state.answers[q.id] ?? []);
    if (selected.has(optionId)) {
      selected.delete(optionId);
    } else {
      if (option?.exclusive) selected = new Set();
      else q.options.filter((o) => o.exclusive).forEach((o) => selected.delete(o.id));
      selected.add(optionId);
    }
    state.answers[q.id] = [...selected];
    stage.querySelectorAll<HTMLElement>('.opt').forEach((b) => b.setAttribute('aria-pressed', String(selected.has(b.dataset.o ?? ''))));
    const cont = stage.querySelector<HTMLButtonElement>('[data-act="continue"]');
    if (cont) cont.disabled = selected.size === 0;
    renderNotes();
    return;
  }
  if (advancing) return;
  advancing = true;
  state.answers[q.id] = [optionId];
  stage.querySelectorAll<HTMLElement>('.opt').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.o === optionId)));
  track('question_answered', { q: q.n, answer: optionId });
  window.setTimeout(() => { advancing = false; next(); }, reduceMotion ? 80 : 260);
}

function continueMulti() {
  const q = QUESTIONS[state.q]!;
  const selected = state.answers[q.id] ?? [];
  if (!q.multi || !selected.length) return;
  track('question_answered', { q: q.n, answer: selected.join('+') });
  next();
}

/* ---------- events ---------- */

stage.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el) return;
  switch (el.dataset.act) {
    case 'start': startQuiz(); break;
    case 'opt': choose(el.dataset.o ?? ''); break;
    case 'continue': continueMulti(); break;
    case 'back': back(); break;
    case 'cta': track('cta_telegram_click', { setup_code: currentProfile().code }); break; // the link itself opens Telegram
    case 'switch': {
      const from = state.override ?? computeScores(state.answers).best;
      state.override = (el.dataset.s as SetupId | undefined) || null;
      render();
      track('result_setup_switched', { from, to: state.override ?? computeScores(state.answers).best });
      break;
    }
    case 'retake':
      state.answers = {};
      state.override = null;
      state.q = 0;
      state.screen = 'quiz';
      render();
      track('quiz_start', { retake: true });
      break;
  }
});

document.addEventListener('keydown', (e) => {
  if (state.screen !== 'quiz' || e.metaKey || e.ctrlKey || e.altKey) return;
  const target = e.target as HTMLElement;
  if (target.closest('input, textarea, select')) return;
  const q = QUESTIONS[state.q]!;
  if (e.key === 'Enter' && q.multi && !target.closest('.opt')) {
    e.preventDefault();
    continueMulti();
    return;
  }
  const i = /^[1-7]$/.test(e.key) ? Number(e.key) - 1 : e.key.length === 1 ? KEYS.indexOf(e.key.toUpperCase()) : -1;
  const option = i >= 0 ? q.options[i] : undefined;
  if (option) {
    e.preventDefault();
    choose(option.id);
  }
});

notesSwitch.checked = state.notes;
notesSwitch.addEventListener('change', () => {
  state.notes = notesSwitch.checked;
  store.set('cp-notes', state.notes ? '1' : '0');
  renderNotes();
});

/* ---------- boot ---------- */

render();
track('landing_view', { bot_configured: Boolean(BOT_USERNAME) });

void fetchLiveFeed().then((feed) => {
  if (!feed) return;
  state.feed = feed;
  state.feedLive = true;
  const rows = document.getElementById('feed');
  const label = document.getElementById('feed-label');
  if (rows) rows.innerHTML = feedRows(feed);
  if (label) label.textContent = feedLabel(true);
});
