function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`${name} is not set. Copy bot/.env.example to bot/.env and fill it in, or set it in Railway variables.`);
    process.exit(1);
  }
  return value;
}

function timeZone(): string {
  const value = process.env.TIME_ZONE?.trim() || 'Europe/Kyiv';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    console.error(`TIME_ZONE "${value}" is not a valid IANA time zone, for example Europe/Kyiv.`);
    process.exit(1);
  }
}

const admin = Number(process.env.ADMIN_CHAT_ID);

export const env = {
  botToken: required('BOT_TOKEN'),
  webUrl: process.env.WEB_URL?.trim() || '',
  dbPath: process.env.DB_PATH?.trim() || './data/cryptopulse.db',
  timeZone: timeZone(),
  checkIntervalSec: Math.max(15, Number(process.env.CHECK_INTERVAL_SEC) || 60),
  binanceBase: process.env.BINANCE_API_BASE?.trim() || 'https://data-api.binance.vision',
  adminChatId: Number.isFinite(admin) && admin !== 0 ? admin : null,
};

export type Env = typeof env;
