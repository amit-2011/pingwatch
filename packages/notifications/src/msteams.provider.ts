import {
  type MsTeamsChannelConfig,
  type NotificationProvider,
  type SendResult,
  msteamsChannelConfigSchema,
} from '@pingwatch/shared';
import { classifyHttp, postJson } from './http';

/** Theme color (hex, no #) by event type. */
function themeColor(eventType: string): string {
  return eventType === 'up' ? '22c55e' : eventType === 'down' ? 'ef4444' : '64748b';
}

/**
 * Microsoft Teams incoming-webhook notifications (P4.4). Uses the legacy MessageCard connector
 * payload — the broadest-compatibility format. Operators on the newer Power Automate Workflows
 * webhooks may need the Adaptive Card variant; that swap stays isolated to this file.
 */
export const msTeamsProvider: NotificationProvider<MsTeamsChannelConfig> = {
  id: 'msteams',
  meta: { label: 'Microsoft Teams', description: 'Post alerts to a Teams channel via an incoming webhook' },
  configSchema: msteamsChannelConfigSchema,

  async send({ config, event, rendered }): Promise<SendResult> {
    const payload = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      themeColor: themeColor(event.type),
      summary: rendered.title,
      sections: [{ activityTitle: rendered.title, text: rendered.body }],
    };
    try {
      const res = await postJson(config.webhookUrl, payload);
      // Teams returns 200 with body `1` on success.
      if (res.statusCode >= 200 && res.statusCode < 300) return { ok: true };
      const body = await res.text();
      return { ok: false, errorKind: classifyHttp(res.statusCode), message: `Teams ${res.statusCode}: ${body.slice(0, 200)}` };
    } catch (err) {
      return { ok: false, errorKind: 'transient', message: err instanceof Error ? err.message : 'send failed' };
    }
  },
};
