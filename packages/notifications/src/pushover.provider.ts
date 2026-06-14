import {
  type NotificationProvider,
  type PushoverChannelConfig,
  type SendResult,
  pushoverChannelConfigSchema,
} from '@pingwatch/shared';
import { classifyHttp, postForm } from './http';

// Overridable for tests; defaults to the real Pushover API.
const API_BASE = process.env.PINGWATCH_PUSHOVER_API_BASE ?? 'https://api.pushover.net';

/** Pushover push notifications (P4.4). */
export const pushoverProvider: NotificationProvider<PushoverChannelConfig> = {
  id: 'pushover',
  meta: { label: 'Pushover', description: 'Send push notifications via Pushover' },
  configSchema: pushoverChannelConfigSchema,

  async send({ config, rendered }): Promise<SendResult> {
    const fields: Record<string, string> = {
      token: config.appToken,
      user: config.userKey,
      title: rendered.title,
      message: rendered.body,
    };
    if (config.priority !== undefined) fields.priority = String(config.priority);
    try {
      const res = await postForm(`${API_BASE}/1/messages.json`, fields);
      if (res.statusCode === 200) return { ok: true };
      const body = await res.text();
      return { ok: false, errorKind: classifyHttp(res.statusCode), message: `Pushover ${res.statusCode}: ${body.slice(0, 200)}` };
    } catch (err) {
      return { ok: false, errorKind: 'transient', message: err instanceof Error ? err.message : 'send failed' };
    }
  },
};
