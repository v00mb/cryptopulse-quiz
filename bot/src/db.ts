import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { normalizeCoins, type CoinId, type Freq, type Level, type SetupId } from '@cryptopulse/shared';

export type Direction = 'above' | 'below';

/** What the user has switched on. */
export interface Settings {
  setup: SetupId;
  level: Level;
  freq: Freq;
  coins: CoinId[];
  moveThreshold: number | null;
  summaryHour: number | null;
  /** 0 = Sunday. Null for a daily summary. */
  summaryWeekday: number | null;
}

export interface Subscriber extends Settings {
  chatId: number;
  paused: boolean;
  lastSummaryKey: string | null;
}

export interface PriceLevel { id: number; chatId: number; coin: CoinId; direction: Direction; price: number }
export interface NewLevel { coin: CoinId; direction: Direction; price: number }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  chat_id          INTEGER PRIMARY KEY,
  created_at       TEXT NOT NULL,
  start_param      TEXT,
  quiz_session     TEXT,
  setup            TEXT,
  level            TEXT,
  freq             TEXT,
  coins            TEXT,
  move_threshold   REAL,
  summary_hour     INTEGER,
  summary_weekday  INTEGER,
  active           INTEGER NOT NULL DEFAULT 0,
  paused           INTEGER NOT NULL DEFAULT 0,
  draft            TEXT,
  pending          TEXT,
  last_summary_key TEXT,
  activated_at     TEXT,
  first_alert_at   TEXT
);
CREATE TABLE IF NOT EXISTS levels (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id      INTEGER NOT NULL,
  coin         TEXT NOT NULL,
  direction    TEXT NOT NULL CHECK (direction IN ('above', 'below')),
  price        REAL NOT NULL,
  created_at   TEXT NOT NULL,
  triggered_at TEXT
);
CREATE INDEX IF NOT EXISTS levels_open ON levels (chat_id) WHERE triggered_at IS NULL;
CREATE TABLE IF NOT EXISTS move_alerts (
  chat_id INTEGER NOT NULL,
  coin    TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (chat_id, coin)
);
CREATE TABLE IF NOT EXISTS alert_log (
  chat_id INTEGER NOT NULL,
  kind    TEXT NOT NULL,
  coin    TEXT,
  day_key TEXT NOT NULL,
  sent_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS alert_log_day ON alert_log (chat_id, day_key, kind);
CREATE TABLE IF NOT EXISTS events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT NOT NULL,
  chat_id INTEGER,
  name    TEXT NOT NULL,
  props   TEXT
);
`;

type SQLValue = null | number | bigint | string | Uint8Array;
type Row = Record<string, SQLValue>;
const now = () => new Date().toISOString();
const json = (v: unknown) => (v == null ? null : JSON.stringify(v));

function parseJson<T>(value: unknown): T | null {
  if (typeof value !== 'string') return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

function toSubscriber(r: Row): Subscriber {
  return {
    chatId: Number(r.chat_id),
    setup: r.setup as SetupId,
    level: r.level as Level,
    freq: r.freq as Freq,
    coins: normalizeCoins(parseJson<string[]>(r.coins) ?? []),
    moveThreshold: r.move_threshold == null ? null : Number(r.move_threshold),
    summaryHour: r.summary_hour == null ? null : Number(r.summary_hour),
    summaryWeekday: r.summary_weekday == null ? null : Number(r.summary_weekday),
    paused: Number(r.paused) === 1,
    lastSummaryKey: (r.last_summary_key as string | null) ?? null,
  };
}

const toLevel = (r: Row): PriceLevel => ({
  id: Number(r.id),
  chatId: Number(r.chat_id),
  coin: r.coin as CoinId,
  direction: r.direction as Direction,
  price: Number(r.price),
});

export class Store {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(SCHEMA);
  }

  close() { this.db.close(); }

  private run(sql: string, ...params: SQLValue[]) { return this.db.prepare(sql).run(...params); }
  private get(sql: string, ...params: SQLValue[]) { return this.db.prepare(sql).get(...params) as unknown as Row | undefined; }
  private all(sql: string, ...params: SQLValue[]) { return this.db.prepare(sql).all(...params) as unknown as Row[]; }

  private transaction(fn: () => void) {
    this.db.exec('BEGIN');
    try { fn(); this.db.exec('COMMIT'); } catch (err) { this.db.exec('ROLLBACK'); throw err; }
  }

  /* users */

  touchUser(chatId: number, startParam: string | null, session: string | null) {
    this.run(
      `INSERT INTO users (chat_id, created_at, start_param, quiz_session) VALUES (?, ?, ?, ?)
       ON CONFLICT (chat_id) DO UPDATE SET
         start_param = COALESCE(excluded.start_param, users.start_param),
         quiz_session = COALESCE(excluded.quiz_session, users.quiz_session)`,
      chatId, now(), startParam, session,
    );
  }

  subscriber(chatId: number): (Subscriber & { active: boolean }) | null {
    const r = this.get('SELECT * FROM users WHERE chat_id = ? AND setup IS NOT NULL', chatId);
    return r ? { ...toSubscriber(r), active: Number(r.active) === 1 } : null;
  }

  activeSubscribers(): Subscriber[] {
    return this.all('SELECT * FROM users WHERE active = 1 AND paused = 0').map(toSubscriber);
  }

  quizSession(chatId: number): string | null {
    return (this.get('SELECT quiz_session FROM users WHERE chat_id = ?', chatId)?.quiz_session as string | null) ?? null;
  }

  /** Saves the settings and switches monitoring on. Returns true the first time a user activates. */
  activate(chatId: number, s: Settings, levels: NewLevel[] | null): boolean {
    let first = false;
    this.transaction(() => {
      first = this.get('SELECT activated_at FROM users WHERE chat_id = ?', chatId)?.activated_at == null;
      this.run(
        `UPDATE users SET setup = ?, level = ?, freq = ?, coins = ?, move_threshold = ?, summary_hour = ?, summary_weekday = ?,
           active = 1, paused = 0, draft = NULL, activated_at = COALESCE(activated_at, ?)
         WHERE chat_id = ?`,
        s.setup, s.level, s.freq, json(s.coins), s.moveThreshold, s.summaryHour, s.summaryWeekday, now(), chatId,
      );
      if (levels) {
        this.run('DELETE FROM levels WHERE chat_id = ? AND triggered_at IS NULL', chatId);
        for (const l of levels) this.addLevel(chatId, l);
      }
    });
    return first;
  }

  setPaused(chatId: number, paused: boolean) {
    this.run('UPDATE users SET paused = ? WHERE chat_id = ?', paused ? 1 : 0, chatId);
  }

  /** The user blocked the bot: stop sending. */
  deactivate(chatId: number) {
    this.run('UPDATE users SET active = 0 WHERE chat_id = ?', chatId);
  }

  setLastSummary(chatId: number, dayKey: string) {
    this.run('UPDATE users SET last_summary_key = ? WHERE chat_id = ?', dayKey, chatId);
  }

  /** Returns true only for the very first alert a user receives. */
  markFirstAlert(chatId: number): boolean {
    return Number(this.run('UPDATE users SET first_alert_at = ? WHERE chat_id = ? AND first_alert_at IS NULL', now(), chatId).changes) === 1;
  }

  /* onboarding state */

  draft<T>(chatId: number): T | null {
    return parseJson<T>(this.get('SELECT draft FROM users WHERE chat_id = ?', chatId)?.draft);
  }

  saveDraft(chatId: number, draft: unknown) {
    this.run('UPDATE users SET draft = ? WHERE chat_id = ?', json(draft), chatId);
  }

  pending<T>(chatId: number): T | null {
    return parseJson<T>(this.get('SELECT pending FROM users WHERE chat_id = ?', chatId)?.pending);
  }

  setPending(chatId: number, pending: unknown) {
    this.run('UPDATE users SET pending = ? WHERE chat_id = ?', json(pending), chatId);
  }

  /* price levels */

  addLevel(chatId: number, l: NewLevel) {
    this.run('INSERT INTO levels (chat_id, coin, direction, price, created_at) VALUES (?, ?, ?, ?, ?)', chatId, l.coin, l.direction, l.price, now());
  }

  openLevels(chatId: number): PriceLevel[] {
    return this.all('SELECT * FROM levels WHERE chat_id = ? AND triggered_at IS NULL ORDER BY coin, price', chatId).map(toLevel);
  }

  markLevelTriggered(id: number) {
    this.run('UPDATE levels SET triggered_at = ? WHERE id = ?', now(), id);
  }

  clearLevels(chatId: number) {
    this.run('DELETE FROM levels WHERE chat_id = ? AND triggered_at IS NULL', chatId);
  }

  /* alert bookkeeping */

  lastMoveAlert(chatId: number, coin: CoinId): Date | null {
    const at = this.get('SELECT sent_at FROM move_alerts WHERE chat_id = ? AND coin = ?', chatId, coin)?.sent_at;
    return typeof at === 'string' ? new Date(at) : null;
  }

  recordMoveAlert(chatId: number, coin: CoinId) {
    this.run(
      `INSERT INTO move_alerts (chat_id, coin, sent_at) VALUES (?, ?, ?)
       ON CONFLICT (chat_id, coin) DO UPDATE SET sent_at = excluded.sent_at`,
      chatId, coin, now(),
    );
  }

  logAlert(chatId: number, kind: 'move' | 'level' | 'summary', coin: CoinId | null, dayKey: string) {
    this.run('INSERT INTO alert_log (chat_id, kind, coin, day_key, sent_at) VALUES (?, ?, ?, ?, ?)', chatId, kind, coin, dayKey, now());
  }

  alertsOnDay(chatId: number, kind: 'move' | 'level' | 'summary', dayKey: string): number {
    return Number(this.get('SELECT COUNT(*) AS n FROM alert_log WHERE chat_id = ? AND kind = ? AND day_key = ?', chatId, kind, dayKey)?.n ?? 0);
  }

  /* analytics */

  logEvent(chatId: number | null, name: string, props: Record<string, unknown>) {
    this.run('INSERT INTO events (at, chat_id, name, props) VALUES (?, ?, ?, ?)', now(), chatId, name, json(props));
  }

  /** Unique users per funnel event. */
  funnel(names: readonly string[]): { name: string; users: number }[] {
    return names.map((name) => ({
      name,
      users: Number(this.get('SELECT COUNT(DISTINCT chat_id) AS n FROM events WHERE name = ?', name)?.n ?? 0),
    }));
  }
}
