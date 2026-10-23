export interface TrackedEvent {
  name: string;
  props: Record<string, string | number | boolean>;
  /** Milliseconds since page load. */
  t: number;
  session: string;
}

type Listener = (events: readonly TrackedEvent[]) => void;

const startedAt = performance.now();
const endpoint = import.meta.env.VITE_ANALYTICS_URL;
const events: TrackedEvent[] = [];
const listeners = new Set<Listener>();

/**
 * Anonymous id for this quiz visit. It also travels inside the Telegram start parameter,
 * so web events and bot events can be joined without any personal data.
 */
export const session = (() => {
  const key = 'cp-session';
  try {
    const saved = sessionStorage.getItem(key);
    if (saved && /^[a-z0-9]{6}$/.test(saved)) return saved;
  } catch { /* storage blocked: fall through */ }
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const id = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => alphabet[b % alphabet.length]).join('');
  try { sessionStorage.setItem(key, id); } catch { /* fine without it */ }
  return id;
})();

export function track(name: string, props: TrackedEvent['props'] = {}) {
  const event: TrackedEvent = { name, props, t: performance.now() - startedAt, session };
  events.push(event);
  (window.dataLayer ??= []).push({ event: name, session, ...props });
  if (endpoint) {
    try { navigator.sendBeacon(endpoint, JSON.stringify(event)); } catch { /* analytics must never break the funnel */ }
  }
  listeners.forEach((l) => l(events));
}

export function onEvents(listener: Listener) {
  listeners.add(listener);
  listener(events);
  return () => listeners.delete(listener);
}
