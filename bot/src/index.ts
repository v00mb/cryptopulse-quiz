import { Bot, GrammyError, HttpError } from 'grammy';
import { fetchTickers, type TickerWindow } from './binance';
import { Store } from './db';
import { env } from './env';
import { COMMANDS, registerHandlers } from './handlers';
import { createMonitor } from './monitor';

const store = new Store(env.dbPath);
const bot = new Bot(env.botToken);

/** Funnel events go to the database (for /stats) and to stdout (Railway logs), tagged with the quiz session. */
function track(chatId: number, name: string, props: Record<string, unknown> = {}) {
  const session = store.quizSession(chatId);
  store.logEvent(chatId, name, { ...props, session });
  console.log(JSON.stringify({ event: name, session, ...props }));
}

// Every check needs the same prices, so one request per window is shared for a few seconds.
const cache = new Map<TickerWindow, { at: number; data: ReturnType<typeof fetchTickers> }>();
function prices(window: TickerWindow = '1d') {
  const hit = cache.get(window);
  if (hit && Date.now() - hit.at < 15_000) return hit.data;
  const data = fetchTickers(env.binanceBase, window);
  data.catch(() => cache.delete(window));
  cache.set(window, { at: Date.now(), data });
  return data;
}

async function send(chatId: number, html: string, silent: boolean): Promise<boolean> {
  try {
    await bot.api.sendMessage(chatId, html, { parse_mode: 'HTML', disable_notification: silent, link_preview_options: { is_disabled: true } });
    return true;
  } catch (err) {
    const gone = err instanceof GrammyError && (err.error_code === 403 || (err.error_code === 400 && /chat not found/i.test(err.description)));
    if (gone) {
      // Blocked by the user, or the chat no longer exists: stop sending to it.
      store.deactivate(chatId);
      track(chatId, 'unreachable', { code: (err as GrammyError).error_code });
    } else {
      console.error(`send failed: ${(err as Error).message}`);
    }
    return false;
  }
}

registerHandlers(bot, {
  store,
  prices,
  track,
  webUrl: env.webUrl,
  timeZone: env.timeZone,
  adminChatId: env.adminChatId,
});

bot.catch((err) => {
  const e = err.error;
  if (e instanceof GrammyError) console.error(`Telegram error in update ${err.ctx.update.update_id}: ${e.description}`);
  else if (e instanceof HttpError) console.error(`Could not reach Telegram: ${e.message}`);
  else console.error('Handler error:', e);
});

const monitor = createMonitor({ store, prices, send, track, timeZone: env.timeZone });
const timer = setInterval(() => void monitor.tick(), env.checkIntervalSec * 1000);

async function shutdown(signal: string) {
  console.log(`${signal} received, stopping`);
  clearInterval(timer);
  await bot.stop().catch(() => undefined);
  store.close();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

/**
 * Long polling. During a Railway redeploy the old container can still be polling for a few seconds,
 * which Telegram answers with 409 Conflict, so we wait and retry instead of crashing.
 */
async function startPolling() {
  await bot.api.setMyCommands(COMMANDS);
  for (let attempt = 1; ; attempt++) {
    try {
      await bot.start({
        allowed_updates: ['message', 'callback_query'],
        onStart: (me) => console.log(`@${me.username} is polling. Checking prices every ${env.checkIntervalSec}s, time zone ${env.timeZone}.`),
      });
      return;
    } catch (err) {
      if (err instanceof GrammyError && err.error_code === 409 && attempt < 20) {
        console.warn('Another instance is still polling, retrying in 5s');
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      throw err;
    }
  }
}

startPolling().catch((err) => {
  if (err instanceof GrammyError && err.error_code === 401) console.error('Telegram rejected BOT_TOKEN (401 Unauthorized). Copy the token from @BotFather again.');
  else console.error('Bot stopped:', err);
  process.exit(1);
});
void monitor.tick();
