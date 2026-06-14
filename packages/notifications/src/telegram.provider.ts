import { request } from 'undici';
import {
  type NotificationProvider,
  type SendResult,
  type TelegramChannelConfig,
  telegramChannelConfigSchema,
} from '@pingwatch/shared';

// Overridable for tests; defaults to the real Bot API.
const API_BASE = process.env.PINGWATCH_TELEGRAM_API_BASE ?? 'https://api.telegram.org';

/** Escape text for Telegram MarkdownV2 (every reserved char must be backslash-escaped). */
export function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

interface TelegramResponse {
  ok?: boolean;
  description?: string;
  result?: { message_id?: number };
}

/** Telegram bot notifications over the raw Bot API (no SDK) — PLAN §4.5. */
export const telegramProvider: NotificationProvider<TelegramChannelConfig> = {
  id: 'telegram',
  meta: { label: 'Telegram', description: 'Send alerts to a Telegram chat via a bot' },
  configSchema: telegramChannelConfigSchema,

  async send({ config, rendered }): Promise<SendResult> {
    const text = `*${escapeMarkdownV2(rendered.title)}*\n${escapeMarkdownV2(rendered.body)}`;
    try {
      const res = await request(`${API_BASE}/bot${config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: config.chatId, text, parse_mode: 'MarkdownV2' }),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.body.json()) as TelegramResponse;
      if (res.statusCode === 200 && json.ok === true) {
        const messageId = json.result?.message_id;
        return {
          ok: true,
          providerMessageId: messageId !== undefined ? String(messageId) : undefined,
        };
      }
      const errorKind: 'transient' | 'permanent' =
        res.statusCode === 429 || res.statusCode >= 500 ? 'transient' : 'permanent';
      return { ok: false, errorKind, message: json.description ?? `HTTP ${res.statusCode}` };
    } catch (err) {
      return { ok: false, errorKind: 'transient', message: err instanceof Error ? err.message : 'send failed' };
    }
  },
};
