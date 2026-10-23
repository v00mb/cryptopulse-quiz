import { InlineKeyboard, type Bot, type Context } from 'grammy';
import {
  COIN_IDS, COINS, decodeSetupCode, fmtPrice, isCoinId, nicePrice, SETUP_IDS, SETUPS,
  type CoinId, type Freq, type Level, type SetupChoice, type SetupId,
} from '@cryptopulse/shared';
import type { Ticker, TickerWindow } from './binance';
import type { NewLevel, Settings, Store } from './db';
import * as msg from './messages';
import { localTime } from './time';
import { inferDirection } from './triggers';

/** Onboarding answers collected in the chat before monitoring is switched on. */
export interface Draft {
  setup: SetupId;
  level: Level;
  freq: Freq;
  coins: CoinId[];
  fromQuiz: boolean;
  moveThreshold: number | null;
  summaryHour: number | null;
  summaryWeekday: number | null;
  levels: NewLevel[] | null;
  levelOptions?: { coin: CoinId; up: number; down: number };
}

interface Pending { kind: 'level'; coin: CoinId }

export interface HandlerDeps {
  store: Store;
  prices: (window?: TickerWindow) => Promise<Map<CoinId, Ticker>>;
  track: (chatId: number, name: string, props?: Record<string, unknown>) => void;
  webUrl: string;
  timeZone: string;
  adminChatId: number | null;
}

export const FUNNEL_EVENTS = ['bot_start', 'coins_selected', 'trigger_set', 'monitoring_active', 'first_alert_delivered', 'paused'] as const;

export const COMMANDS = [
  { command: 'settings', description: 'Change coins, triggers or setup' },
  { command: 'status', description: 'What I am watching for you' },
  { command: 'levels', description: 'Add or clear price levels' },
  { command: 'pause', description: 'Stop alerts for now' },
  { command: 'resume', description: 'Turn alerts back on' },
  { command: 'help', description: 'All commands' },
];

export function draftFromChoice(choice: SetupChoice, fromQuiz: boolean): Draft {
  return {
    setup: choice.setup,
    level: choice.level,
    freq: choice.freq,
    coins: choice.coins,
    fromQuiz,
    moveThreshold: SETUPS[choice.setup].moveThreshold,
    summaryHour: null,
    summaryWeekday: null,
    levels: null,
  };
}

/** Switching setup keeps what the user already chose and resets what belongs to the old setup. */
export function draftForSetup(setup: SetupId, base: Draft | null): Draft {
  const s = SETUPS[setup];
  return {
    setup,
    level: base?.level ?? 'standard',
    freq: base?.fromQuiz ? base.freq : s.defaultFreq,
    coins: base?.coins.length ? base.coins : s.defaultCoins.slice(),
    fromQuiz: base?.fromQuiz ?? false,
    moveThreshold: s.moveThreshold,
    summaryHour: null,
    summaryWeekday: null,
    levels: null,
  };
}

export function settingsFromDraft(d: Draft): Settings {
  let summaryHour: number | null = null;
  let summaryWeekday: number | null = null;
  if (d.setup === 'mb') {
    summaryHour = d.summaryHour ?? 19;
    summaryWeekday = d.summaryWeekday;
  } else if (d.freq === 'daily') {
    summaryHour = 19;
  } else if (d.freq === 'weekly') {
    summaryHour = 10;
    summaryWeekday = 0;
  }
  return {
    setup: d.setup,
    level: d.level,
    freq: d.freq,
    coins: d.coins,
    moveThreshold: d.setup === 'ta' ? null : d.moveThreshold ?? SETUPS[d.setup].moveThreshold,
    summaryHour,
    summaryWeekday,
  };
}

const html = { parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true } };

function coinsKeyboard(selected: readonly CoinId[], prefix: string, withDone: boolean) {
  const kb = new InlineKeyboard();
  COIN_IDS.forEach((c, i) => {
    kb.text(`${selected.includes(c) ? '✓ ' : ''}${c}`, `${prefix}${c}`);
    if (i % 3 === 2) kb.row();
  });
  if (withDone) kb.text('Done', 'ob:coins');
  return kb;
}

/** Marks the answered step: keeps the message, removes its buttons, appends the choice. */
async function settle(ctx: Context, choice: string) {
  const m = ctx.callbackQuery?.message;
  try {
    if (m && 'text' in m && m.text) await ctx.editMessageText(`${m.text}\n\n✓ ${choice}`, { entities: m.entities });
    else await ctx.editMessageReplyMarkup();
  } catch { /* too old to edit, or unchanged */ }
}

export function registerHandlers(bot: Bot, d: HandlerDeps) {
  const pm = bot.chatType('private');
  const { store } = d;

  const now = () => localTime(new Date(), d.timeZone);

  async function welcomeStep(ctx: Context, draft: Draft) {
    await ctx.reply(msg.welcome(draft.setup, draft.fromQuiz), {
      ...html,
      reply_markup: new InlineKeyboard().text('Set it up', 'ob:go').text('See other setups', 'ob:others'),
    });
  }

  async function pickSetupStep(ctx: Context, text: string) {
    const kb = new InlineKeyboard();
    for (const s of SETUP_IDS) kb.text(SETUPS[s].name, `ob:pick:${s}`).row();
    await ctx.reply(text, { ...html, reply_markup: kb });
  }

  async function coinsStep(ctx: Context, draft: Draft) {
    const note = draft.fromQuiz ? "I've ticked the ones from your quiz." : "I've ticked a starting set. Change it if you like.";
    await ctx.reply(`Which coins should I watch? ${note}`, { ...html, reply_markup: coinsKeyboard(draft.coins, 'ob:coin:', true) });
  }

  async function triggerStep(ctx: Context, chatId: number, draft: Draft) {
    if (draft.setup === 'mb') {
      const weekly = draft.freq === 'weekly';
      const kb = weekly
        ? new InlineKeyboard().text('Sunday, 10:00', 'ob:sum:sun-10').text('Sunday, 19:00', 'ob:sum:sun-19')
        : new InlineKeyboard().text('Morning, 09:00', 'ob:sum:9').text('Evening, 19:00', 'ob:sum:19');
      await ctx.reply(
        `When should your ${weekly ? 'weekly recap' : 'daily summary'} arrive? A heads-up on moves over ±${draft.moveThreshold ?? 10}% comes on top, at any time.`,
        { ...html, reply_markup: kb },
      );
      return;
    }
    if (draft.setup === 'wp') {
      await ctx.reply('Alert me when one of your coins moves more than…', {
        ...html,
        reply_markup: new InlineKeyboard().text('±3%', 'ob:thr:3').text('±5% · suggested', 'ob:thr:5').text('±10%', 'ob:thr:10'),
      });
      return;
    }
    const coin = draft.coins[0] ?? 'BTC';
    let ticker: Ticker | undefined;
    try { ticker = (await d.prices()).get(coin); } catch { ticker = undefined; }
    if (!ticker) {
      await ctx.reply("I can't reach market data right now. Try again in a minute.", { reply_markup: new InlineKeyboard().text('Try again', 'ob:retry') });
      return;
    }
    draft.levelOptions = { coin, up: nicePrice(ticker.price * 1.05), down: nicePrice(ticker.price * 0.95) };
    store.saveDraft(chatId, draft);
    const { up, down } = draft.levelOptions;
    await ctx.reply(`Set your first price level for ${COINS[coin].name}. It's at ${fmtPrice(ticker.price)} right now. You can add exact levels later with /levels.`, {
      ...html,
      reply_markup: new InlineKeyboard()
        .text(`Above ${fmtPrice(up)}`, 'ob:lvl:up').row()
        .text(`Below ${fmtPrice(down)}`, 'ob:lvl:down').row()
        .text('Both', 'ob:lvl:both'),
    });
  }

  async function confirmStep(ctx: Context, draft: Draft) {
    await ctx.reply(`Here's your setup:\n\n${msg.settingsSummary(settingsFromDraft(draft), draft.levels ?? [], d.timeZone)}`, {
      ...html,
      reply_markup: new InlineKeyboard().text('Turn on monitoring', 'ob:on').row().text('Change something', 'ob:change'),
    });
  }

  async function activateStep(ctx: Context, chatId: number, draft: Draft) {
    const settings = settingsFromDraft(draft);
    const first = store.activate(chatId, settings, draft.setup === 'ta' ? draft.levels ?? [] : null);
    d.track(chatId, 'monitoring_active', { setup: settings.setup, coins: settings.coins.length, first });
    await ctx.reply(msg.activated(), html);
    try {
      const tickers = await d.prices();
      const mine = settings.coins.map((c) => tickers.get(c)).filter((t): t is Ticker => Boolean(t));
      if (mine.length) await ctx.reply(msg.snapshot({ level: settings.level, time: now(), timeZone: d.timeZone }, mine), html);
    } catch { /* the snapshot is a bonus; monitoring is already on */ }
  }

  /* commands */

  pm.command('start', async (ctx) => {
    const chatId = ctx.chat.id;
    const payload = ctx.match.trim();
    const choice = payload ? decodeSetupCode(payload) : null;
    store.touchUser(chatId, payload || null, choice?.session ?? null);
    d.track(chatId, 'bot_start', { start_param: payload || null, valid: Boolean(choice) });
    if (!choice) {
      store.saveDraft(chatId, null);
      await pickSetupStep(ctx, msg.noCodeWelcome(d.webUrl));
      return;
    }
    const draft = draftFromChoice(choice, true);
    store.saveDraft(chatId, draft);
    await welcomeStep(ctx, draft);
  });

  pm.command('settings', async (ctx) => {
    const chatId = ctx.chat.id;
    store.touchUser(chatId, null, null);
    const sub = store.subscriber(chatId);
    if (!sub) {
      await pickSetupStep(ctx, msg.noCodeWelcome(d.webUrl));
      return;
    }
    const draft: Draft = {
      setup: sub.setup, level: sub.level, freq: sub.freq, coins: sub.coins, fromQuiz: false,
      moveThreshold: sub.moveThreshold, summaryHour: sub.summaryHour, summaryWeekday: sub.summaryWeekday, levels: null,
    };
    store.saveDraft(chatId, draft);
    await ctx.reply(`Your current setup:\n\n${msg.settingsSummary(sub, store.openLevels(chatId), d.timeZone)}`, {
      ...html,
      reply_markup: new InlineKeyboard().text('Change coins and triggers', 'ob:go').row().text('Switch setup', 'ob:others'),
    });
  });

  pm.command('status', async (ctx) => {
    const sub = store.subscriber(ctx.chat.id);
    if (!sub?.active) {
      await ctx.reply('Nothing is switched on yet. Send /start to set up monitoring.');
      return;
    }
    const state = sub.paused ? '<b>Paused.</b> Send /resume to turn alerts back on.\n\n' : '';
    await ctx.reply(state + msg.settingsSummary(sub, store.openLevels(ctx.chat.id), d.timeZone), html);
  });

  pm.command('pause', async (ctx) => {
    store.setPaused(ctx.chat.id, true);
    d.track(ctx.chat.id, 'paused');
    await ctx.reply('Paused. No alerts until you send /resume.');
  });

  pm.command('resume', async (ctx) => {
    const sub = store.subscriber(ctx.chat.id);
    if (!sub?.active) {
      await ctx.reply('Nothing to resume yet. Send /start to set up monitoring.');
      return;
    }
    store.setPaused(ctx.chat.id, false);
    d.track(ctx.chat.id, 'resumed');
    await ctx.reply('Alerts are back on.');
  });

  pm.command('help', (ctx) => ctx.reply(msg.HELP, html));

  pm.command('levels', async (ctx) => {
    const sub = store.subscriber(ctx.chat.id);
    if (!sub?.active) {
      await ctx.reply('Switch monitoring on first: send /start.');
      return;
    }
    const open = store.openLevels(ctx.chat.id);
    const list = open.length ? `<b>Your price levels</b>\n${open.map((l) => `• ${msg.levelLine(l)}`).join('\n')}` : "You don't have any price levels yet.";
    const kb = coinsKeyboard(sub.coins, 'lv:', false);
    if (open.length) kb.row().text('Clear all levels', 'lv:clear');
    await ctx.reply(`${list}\n\nPick a coin, then send me a price. I'll work out whether it is above or below the current price.`, { ...html, reply_markup: kb });
  });

  pm.command('id', (ctx) => ctx.reply(`Your chat id: ${ctx.chat.id}`));

  pm.command('stats', async (ctx) => {
    if (d.adminChatId === null || ctx.chat.id !== d.adminChatId) return;
    const rows = store.funnel(FUNNEL_EVENTS);
    const base = rows[0]?.users || 0;
    const lines = rows.map((r) => `${r.name}: ${r.users}${base ? ` (${Math.round((r.users / base) * 100)}%)` : ''}`);
    await ctx.reply(`<b>Bot funnel, unique users</b>\n<code>${lines.join('\n')}</code>`, html);
  });

  /* onboarding buttons */

  pm.callbackQuery(/^ob:([a-z]+)(?::([A-Za-z0-9-]+))?$/, async (ctx) => {
    const chatId = ctx.chat.id;
    const [, action = '', arg = ''] = ctx.match as RegExpMatchArray;
    let draft = store.draft<Draft>(chatId);

    if (action === 'pick' && (SETUP_IDS as readonly string[]).includes(arg)) {
      draft = draftForSetup(arg as SetupId, draft);
      store.saveDraft(chatId, draft);
      await ctx.answerCallbackQuery();
      await settle(ctx, SETUPS[arg as SetupId].name);
      await ctx.reply(msg.setupPitch(draft.setup), html);
      await coinsStep(ctx, draft);
      return;
    }
    if (!draft) {
      await ctx.answerCallbackQuery({ text: 'This setup has expired. Send /start to begin again.', show_alert: true });
      return;
    }

    switch (action) {
      case 'go':
      case 'change':
        await ctx.answerCallbackQuery();
        await settle(ctx, action === 'go' ? 'Set it up' : 'Change something');
        await coinsStep(ctx, draft);
        return;

      case 'others':
        await ctx.answerCallbackQuery();
        await settle(ctx, 'See other setups');
        await pickSetupStep(ctx, `Here are all three. Your quiz match is <b>${SETUPS[draft.setup].name}</b>.`);
        return;

      case 'coin': {
        if (!isCoinId(arg)) return ignore();
        const coins = draft.coins.includes(arg) ? draft.coins.filter((c) => c !== arg) : [...draft.coins, arg];
        draft.coins = COIN_IDS.filter((c) => coins.includes(c));
        store.saveDraft(chatId, draft);
        await ctx.answerCallbackQuery();
        await ctx.editMessageReplyMarkup({ reply_markup: coinsKeyboard(draft.coins, 'ob:coin:', true) }).catch(() => undefined);
        return;
      }

      case 'coins':
        if (!draft.coins.length) {
          await ctx.answerCallbackQuery({ text: 'Pick at least one coin.' });
          return;
        }
        await ctx.answerCallbackQuery();
        await settle(ctx, draft.coins.join(', '));
        d.track(chatId, 'coins_selected', { count: draft.coins.length });
        await triggerStep(ctx, chatId, draft);
        return;

      case 'retry':
        await ctx.answerCallbackQuery();
        await settle(ctx, 'Trying again');
        await triggerStep(ctx, chatId, draft);
        return;

      case 'sum': {
        const weekly = arg.startsWith('sun-');
        const hour = Number(weekly ? arg.slice(4) : arg);
        if (![9, 10, 19].includes(hour)) return ignore();
        draft.summaryHour = hour;
        draft.summaryWeekday = weekly ? 0 : null;
        return chosenTrigger(ctx, chatId, draft, `${weekly ? 'Sunday, ' : ''}${String(hour).padStart(2, '0')}:00`, `summary:${arg}`);
      }

      case 'thr': {
        const threshold = Number(arg);
        if (![3, 5, 10].includes(threshold)) return ignore();
        draft.moveThreshold = threshold;
        return chosenTrigger(ctx, chatId, draft, `±${threshold}%`, `move:${threshold}`);
      }

      case 'lvl': {
        const o = draft.levelOptions;
        if (!o || !['up', 'down', 'both'].includes(arg)) return ignore();
        const up: NewLevel = { coin: o.coin, direction: 'above', price: o.up };
        const down: NewLevel = { coin: o.coin, direction: 'below', price: o.down };
        draft.levels = arg === 'up' ? [up] : arg === 'down' ? [down] : [up, down];
        return chosenTrigger(ctx, chatId, draft, draft.levels.map(msg.levelLine).join(' and '), `level:${arg}`);
      }

      case 'on':
        await ctx.answerCallbackQuery({ text: 'Monitoring is on' });
        await settle(ctx, 'Turn on monitoring');
        await activateStep(ctx, chatId, draft);
        return;

      default:
        return ignore();
    }

    async function ignore() {
      await ctx.answerCallbackQuery().catch(() => undefined);
    }
  });

  async function chosenTrigger(ctx: Context, chatId: number, draft: Draft, label: string, type: string) {
    store.saveDraft(chatId, draft);
    await ctx.answerCallbackQuery();
    await settle(ctx, label);
    d.track(chatId, 'trigger_set', { type });
    await confirmStep(ctx, draft);
  }

  /* /levels buttons and typed prices */

  pm.callbackQuery(/^lv:([A-Za-z]+)$/, async (ctx) => {
    const chatId = ctx.chat.id;
    const arg = (ctx.match as RegExpMatchArray)[1] ?? '';
    await ctx.answerCallbackQuery();
    if (arg === 'clear') {
      store.clearLevels(chatId);
      await settle(ctx, 'Cleared');
      await ctx.reply('All price levels are cleared.');
      return;
    }
    if (!isCoinId(arg)) return;
    store.setPending(chatId, { kind: 'level', coin: arg } satisfies Pending);
    await settle(ctx, arg);
    let hint = '';
    try {
      const t = (await d.prices()).get(arg);
      if (t) hint = ` It's at ${fmtPrice(t.price)} now.`;
    } catch { /* the price is a hint only */ }
    await ctx.reply(`Send me the price level for ${COINS[arg].name} as a number, for example 110000.${hint}`);
  });

  pm.on('message:text', async (ctx) => {
    const chatId = ctx.chat.id;
    const pending = store.pending<Pending>(chatId);
    if (pending?.kind !== 'level') {
      await ctx.reply('I only understand commands for now. Send /help to see them.');
      return;
    }
    const target = Number(ctx.message.text.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(target) || target <= 0) {
      await ctx.reply('Send just a number, for example 110000.');
      return;
    }
    let ticker: Ticker | undefined;
    try { ticker = (await d.prices()).get(pending.coin); } catch { ticker = undefined; }
    if (!ticker) {
      await ctx.reply("I can't reach market data right now. Send the number again in a minute.");
      return;
    }
    const direction = inferDirection(target, ticker.price);
    if (!direction) {
      await ctx.reply(`That's the current price. Send a level above or below ${fmtPrice(ticker.price)}.`);
      return;
    }
    store.addLevel(chatId, { coin: pending.coin, direction, price: target });
    store.setPending(chatId, null);
    d.track(chatId, 'level_added', { coin: pending.coin, direction });
    await ctx.reply(`Got it. I'll message you when ${pending.coin} goes ${direction} ${fmtPrice(target)}. It's at ${fmtPrice(ticker.price)} now.`);
  });
}
