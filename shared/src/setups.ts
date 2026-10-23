import type { CoinId } from './coins';

export type SetupId = 'mb' | 'wp' | 'ta';
export type Level = 'plain' | 'standard' | 'compact';
export type Freq = 'instant' | 'big' | 'daily' | 'weekly';

/** Also the tie-break order: on equal scores the simpler setup wins (MVP focus). */
export const SETUP_IDS: readonly SetupId[] = ['mb', 'wp', 'ta'];

export interface Setup {
  id: SetupId;
  name: string;
  short: string;
  segment: string;
  tagline: string;
  trigger: string;
  /** The third onboarding step in the bot, as promised on the result screen. */
  step3: string;
  defaultCoins: CoinId[];
  defaultFreq: Freq;
  /** 24h move (in %) that triggers an alert, or null when the setup has no move alerts. */
  moveThreshold: number | null;
  roadmap?: string;
}

export const SETUPS: Record<SetupId, Setup> = {
  mb: {
    id: 'mb',
    name: 'Market Basics',
    short: 'Basics',
    segment: 'Crypto beginners',
    tagline: 'A calm read on the market in plain words, without charts.',
    trigger: 'A summary on your schedule, plus a heads-up on moves over ±10% in 24h',
    step3: 'Pick when your summary arrives.',
    defaultCoins: ['BTC', 'ETH'],
    defaultFreq: 'daily',
    moveThreshold: 10,
  },
  wp: {
    id: 'wp',
    name: 'Watchlist Pulse',
    short: 'Pulse',
    segment: 'Casual market followers',
    tagline: 'Your coins on a watchlist, and a message only when something important happens.',
    trigger: 'An alert when a coin on your list moves more than ±5% in 24h',
    step3: 'Pick how big a move should trigger an alert.',
    defaultCoins: ['BTC', 'ETH', 'SOL'],
    defaultFreq: 'big',
    moveThreshold: 5,
  },
  ta: {
    id: 'ta',
    name: 'Price Level Alerts',
    short: 'Levels',
    segment: 'Active market watchers',
    tagline: 'Exact price levels you choose, with an alert the moment one is crossed.',
    trigger: 'An alert when a coin crosses a price level you set',
    step3: 'Set your first price level.',
    defaultCoins: ['BTC'],
    defaultFreq: 'instant',
    moveThreshold: null,
    roadmap: 'Coming later: alerts on trading volume and on combined conditions.',
  },
};

export const LEVELS: Record<Level, { code: string; label: string }> = {
  plain: { code: 'pln', label: 'Plain language, with terms explained' },
  standard: { code: 'std', label: 'Short context, light on jargon' },
  compact: { code: 'cmp', label: 'Compact: numbers and times only' },
};

export const FREQS: Record<Freq, { code: string; label: string }> = {
  instant: { code: 'ins', label: 'Instant, as soon as a trigger fires' },
  big: { code: 'big', label: 'Only when a trigger fires, nothing else' },
  daily: { code: 'day', label: 'One summary a day, at a time you pick' },
  weekly: { code: 'wk', label: 'A weekly recap on Sunday' },
};

/** Quiet hours, local time: alerts still arrive, but silently. */
export const QUIET_HOURS = { from: 23, to: 8 } as const;

/** Big-move alerts per user per day. Price levels are never capped: the user asked for them. */
export const DAILY_MOVE_ALERT_CAP = 5;
