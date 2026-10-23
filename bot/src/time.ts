import { QUIET_HOURS } from '@cryptopulse/shared';

export interface LocalTime {
  hour: number;
  minute: number;
  /** 0 = Sunday */
  weekday: number;
  /** YYYY-MM-DD in the bot's time zone, used to count alerts per day. */
  dayKey: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const formatters = new Map<string, Intl.DateTimeFormat>();

export function localTime(date: Date, timeZone: string): LocalTime {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  const parts = Object.fromEntries(f.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday ?? ''),
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export const isQuietHour = (hour: number) => hour >= QUIET_HOURS.from || hour < QUIET_HOURS.to;

export const clock = (t: Pick<LocalTime, 'hour' | 'minute'>) =>
  `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;

/** "Europe/Kyiv" → "Kyiv" */
export const zoneLabel = (timeZone: string) => (timeZone.split('/').pop() ?? timeZone).replace(/_/g, ' ');

export const dayOfYear = (date: Date) =>
  Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86_400_000);
