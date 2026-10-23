import { normalizeCoins, type CoinId } from './coins';
import { FREQS, LEVELS, SETUP_IDS, SETUPS, type Freq, type Level, type SetupId } from './setups';

/**
 * The quiz result travels to the bot as the Telegram deep-link start parameter:
 *   t.me/<bot>?start=wp-std-big-btc-eth_k3f9x2
 *   setup - explanation level - delivery - coins... _ anonymous quiz session
 * Telegram allows up to 64 characters from [A-Za-z0-9_-]. No personal data goes in.
 */
export interface SetupChoice {
  setup: SetupId;
  level: Level;
  freq: Freq;
  coins: CoinId[];
  session?: string;
}

export const START_PARAM_MAX = 64;
const SESSION_RE = /^[a-z0-9]{4,12}$/;

const invert = <K extends string>(map: Record<K, { code: string }>) =>
  Object.fromEntries(Object.entries(map).map(([key, v]) => [(v as { code: string }).code, key])) as Record<string, K>;

const LEVEL_BY_CODE = invert(LEVELS);
const FREQ_BY_CODE = invert(FREQS);

export function encodeSetupCode(choice: SetupChoice): string {
  const coins = normalizeCoins(choice.coins);
  const parts = [choice.setup, LEVELS[choice.level].code, FREQS[choice.freq].code, ...coins.map((c) => c.toLowerCase())];
  const session = choice.session && SESSION_RE.test(choice.session) ? `_${choice.session}` : '';
  return parts.join('-') + session;
}

export function decodeSetupCode(raw: string): SetupChoice | null {
  const value = raw.trim();
  if (!value || value.length > START_PARAM_MAX || !/^[A-Za-z0-9_-]+$/.test(value)) return null;

  const [main = '', session] = value.toLowerCase().split('_');
  const [setup, levelCode, freqCode, ...coinParts] = main.split('-');
  if (!setup || !(SETUP_IDS as readonly string[]).includes(setup)) return null;

  const level = LEVEL_BY_CODE[levelCode ?? ''];
  const freq = FREQ_BY_CODE[freqCode ?? ''];
  if (!level || !freq) return null;

  const setupId = setup as SetupId;
  const coins = normalizeCoins(coinParts);
  return {
    setup: setupId,
    level,
    freq,
    coins: coins.length ? coins : SETUPS[setupId].defaultCoins.slice(),
    session: session && SESSION_RE.test(session) ? session : undefined,
  };
}
