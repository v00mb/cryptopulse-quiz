import {
  encodeSetupCode, normalizeCoins, SETUP_IDS, SETUPS,
  type CoinId, type Freq, type Level, type Setup, type SetupId,
} from '@cryptopulse/shared';
import { QUESTIONS, type Focus, type Option, type Question, type QuestionId, type Worry } from '../config/quiz';

/** Every answer is stored as a list of option ids; single-choice questions hold one. */
export type Answers = Partial<Record<QuestionId, string[]>>;

export interface Contribution { q: Question; o: Option; setup: SetupId; value: number }
export interface Scores { scores: Record<SetupId, number>; best: SetupId; contrib: Contribution[] }

/** Highest total any setup can reach, used to scale the score bars. */
export const MAX_SCORE = Math.max(
  ...SETUP_IDS.map((s) => QUESTIONS.reduce((sum, q) => {
    const top = Math.max(0, ...q.options.map((o) => o.pts?.[s] ?? 0));
    return sum + top * q.weight * (q.multi ? q.options.filter((o) => o.pts?.[s]).length : 1);
  }, 0)),
);

export function chosenOptions(q: Question, answers: Answers): Option[] {
  const ids = answers[q.id] ?? [];
  return q.options.filter((o) => ids.includes(o.id));
}

export function computeScores(answers: Answers): Scores {
  const scores: Record<SetupId, number> = { mb: 0, wp: 0, ta: 0 };
  const contrib: Contribution[] = [];
  for (const q of QUESTIONS) {
    for (const o of chosenOptions(q, answers)) {
      for (const setup of SETUP_IDS) {
        const raw = o.pts?.[setup];
        if (!raw) continue;
        const value = raw * q.weight;
        scores[setup] += value;
        contrib.push({ q, o, setup, value });
      }
    }
  }
  // Strict ">" keeps the earlier (simpler) setup on ties.
  const best = SETUP_IDS.reduce((a, b) => (scores[b] > scores[a] ? b : a));
  return { scores, best, contrib };
}

export interface Profile {
  scores: Scores;
  setupId: SetupId;
  setup: Setup;
  level: Level;
  focus: Focus;
  freq: Freq;
  coins: CoinId[];
  coinsFromQuiz: boolean;
  worry: Worry;
  code: string;
}

const single = (answers: Answers, id: QuestionId) => answers[id]?.[0];
const option = (answers: Answers, id: QuestionId) =>
  QUESTIONS.find((q) => q.id === id)?.options.find((o) => o.id === single(answers, id));

export function buildProfile(answers: Answers, override: SetupId | null, session?: string): Profile {
  const scores = computeScores(answers);
  const setupId = override ?? scores.best;
  const setup = SETUPS[setupId];
  const picked = normalizeCoins(answers.coins ?? []);
  const coins = picked.length ? picked : setup.defaultCoins.slice();
  const level = option(answers, 'exp')?.level ?? 'standard';
  const freq = (single(answers, 'freq') as Freq | undefined) ?? setup.defaultFreq;
  return {
    scores,
    setupId,
    setup,
    level,
    focus: option(answers, 'data')?.focus ?? 'moves',
    freq,
    coins,
    coinsFromQuiz: picked.length > 0,
    worry: (single(answers, 'worry') as Worry | undefined) ?? 'spam',
    code: encodeSetupCode({ setup: setupId, level, freq, coins, session }),
  };
}

/** The answers that weighed most for a setup, for "Why this setup". */
export function topReasons(scores: Scores, setupId: SetupId, limit = 3) {
  const byQuestion = new Map<QuestionId, { q: Question; labels: string[]; value: number }>();
  for (const c of scores.contrib) {
    if (c.setup !== setupId) continue;
    const entry = byQuestion.get(c.q.id) ?? { q: c.q, labels: [], value: 0 };
    entry.labels.push(c.o.label);
    entry.value += c.value;
    byQuestion.set(c.q.id, entry);
  }
  return [...byQuestion.values()].sort((a, b) => b.value - a.value).slice(0, limit);
}
