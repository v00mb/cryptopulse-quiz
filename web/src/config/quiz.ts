import { COIN_IDS, COINS, type Level, type SetupId } from '@cryptopulse/shared';

/**
 * Everything marketing may want to change lives here: questions, answers, weights and copy.
 * Rule for every question: an answer must change the recommendation or the setup, or it gets cut.
 */

export type QuestionId = 'goal' | 'exp' | 'data' | 'freq' | 'value' | 'coins' | 'worry';
export type Focus = 'context' | 'moves' | 'levels' | 'overview';
export type Worry = 'spam' | 'keys' | 'complex' | 'trust';
export type Points = Partial<Record<SetupId, number>>;

export interface Option {
  id: string;
  label: string;
  sub?: string;
  /** Raw points (0–2) per setup, multiplied by the question weight. */
  pts?: Points;
  level?: Level;
  focus?: Focus;
  /** Selecting it clears the other answers of a multi-select question. */
  exclusive?: boolean;
}

export interface Question {
  id: QuestionId;
  n: number;
  weight: number;
  /** Label for this answer in "Why this setup". */
  reason: string;
  title: string;
  hint?: string;
  learn: string;
  use: string;
  multi?: boolean;
  /** Added on top of the original five-question brief. */
  added?: boolean;
  options: Option[];
}

export const QUESTIONS: Question[] = [
  {
    id: 'goal', n: 1, weight: 3, reason: 'Your goal',
    title: 'What brings you to crypto market data?', hint: 'Pick the one closest to you.',
    learn: 'Main motivation', use: 'Strongest signal for which setup fits.',
    options: [
      { id: 'learn', label: "I'm new and want to understand what's going on", pts: { mb: 2 } },
      { id: 'hold', label: 'I hold a few coins and want to know when something important happens', pts: { wp: 2 } },
      { id: 'react', label: 'I want to know the moment a coin reaches a price I care about', pts: { ta: 2 } },
      { id: 'curious', label: "I'm curious and want to keep an eye on the market", pts: { mb: 1, wp: 1 } },
    ],
  },
  {
    id: 'exp', n: 2, weight: 1, reason: 'Your experience',
    title: 'How familiar are you with crypto?',
    learn: 'Experience level', use: 'Sets how much each message explains. Small setup signal.',
    options: [
      { id: 'none', label: "I haven't bought any crypto yet", pts: { mb: 2 }, level: 'plain' },
      { id: 'little', label: "I've bought a little but don't follow it closely", pts: { mb: 1, wp: 1 }, level: 'plain' },
      { id: 'basics', label: 'I check prices now and then and know the basics', pts: { wp: 2 }, level: 'standard' },
      { id: 'pro', label: 'I follow charts and price levels regularly', pts: { ta: 2 }, level: 'compact' },
    ],
  },
  {
    id: 'data', n: 3, weight: 2, reason: 'What you want to get',
    title: 'What would be most useful to get?',
    learn: 'Type of data needed', use: 'Sets the main feature of the setup.',
    options: [
      { id: 'why', label: 'Short explanations of why prices moved', pts: { mb: 2 }, focus: 'context' },
      { id: 'moves', label: 'A heads-up when my coins make a big move', pts: { wp: 2 }, focus: 'moves' },
      { id: 'levels', label: 'Alerts at exact price levels I set', pts: { ta: 2 }, focus: 'levels' },
      { id: 'overview', label: 'A quick overview of the whole market', pts: { mb: 1, wp: 1 }, focus: 'overview' },
    ],
  },
  {
    id: 'freq', n: 4, weight: 1, reason: 'How often',
    title: 'How often do you want to hear from CryptoPulse?',
    learn: 'Alert frequency', use: 'Sets the delivery format: instant, big moves only, daily or weekly.',
    options: [
      { id: 'instant', label: 'Right away, whenever something I track happens', pts: { ta: 2 } },
      { id: 'big', label: 'Only when something big happens', pts: { wp: 2 } },
      { id: 'daily', label: 'One short summary a day', pts: { mb: 1, wp: 1 } },
      { id: 'weekly', label: 'A weekly recap is enough', pts: { mb: 2 } },
    ],
  },
  {
    id: 'value', n: 5, weight: 1.5, reason: 'What makes it worth keeping',
    title: 'What would make CryptoPulse worth keeping?',
    learn: 'Expected value', use: 'Refines the recommendation when earlier answers point different ways.',
    options: [
      { id: 'understand', label: 'Understanding the market without reading charts', pts: { mb: 2 } },
      { id: 'noapp', label: 'Not having to open an exchange app all the time', pts: { wp: 2 } },
      { id: 'nomiss', label: 'Knowing the moment my price level is reached', pts: { ta: 2 } },
      { id: 'time', label: 'Less time spent on news and noise', pts: { mb: 1, wp: 1 } },
    ],
  },
  {
    id: 'coins', n: 6, weight: 1, multi: true, added: true, reason: 'Your coins',
    title: 'Which coins do you want to watch?', hint: 'Pick any. You can change them in Telegram later.',
    learn: 'Assets of interest', use: 'Prefills the watchlist in the bot. “Not sure” leans to Market Basics.',
    options: [
      ...COIN_IDS.map((id) => ({ id, label: COINS[id].name, sub: id })),
      { id: 'unsure', label: 'Not sure yet, suggest some for me', pts: { mb: 1 }, exclusive: true },
    ],
  },
  {
    id: 'worry', n: 7, weight: 0, added: true, reason: 'Your concern',
    title: 'What would put you off an alert service?', hint: "We'll show how CryptoPulse handles it.",
    learn: 'Main concern', use: 'Picks the reassurance shown next to the final CTA. No effect on scoring.',
    options: [
      { id: 'spam', label: 'Too many notifications' },
      { id: 'keys', label: 'Having to connect my exchange or wallet' },
      { id: 'complex', label: 'A complicated setup' },
      { id: 'trust', label: 'Not knowing if the data is accurate' },
    ],
  },
];

export const FOCUS: Record<Focus, string> = {
  context: 'Each message says why the price moved',
  moves: 'Big-move alerts for your watchlist',
  levels: 'Alerts at exact price levels',
  overview: 'A short overview of the whole market',
};

export const WORRY: Record<Worry, { title: string; text: string }> = {
  spam: {
    title: 'You mentioned too many notifications.',
    text: 'You set the rhythm. Between 23:00 and 08:00 alerts arrive silently, big-move alerts are capped at 5 a day, and /pause stops everything.',
  },
  keys: {
    title: 'You mentioned connecting an exchange or wallet.',
    text: 'CryptoPulse uses public market data only. No exchange login, no API keys, no wallet, no deposits.',
  },
  complex: {
    title: 'You mentioned a complicated setup.',
    text: 'Setup takes three taps in Telegram, with your quiz answers already filled in. You can change anything later with /settings.',
  },
  trust: {
    title: 'You mentioned data accuracy.',
    text: 'Every alert shows its price source (Binance spot market) and the time of the reading, so you can check it yourself.',
  },
};
