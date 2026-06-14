import { request } from 'undici';
import {
  type NotificationProvider,
  type SendResult,
  type SlackChannelConfig,
  slackChannelConfigSchema,
} from '@pingwatch/shared';

/** Slack incoming-webhook notifications with a colored Block Kit attachment (PLAN §4 / P2.4). */
export const slackProvider: NotificationProvider<SlackChannelConfig> = {
  id: 'slack',
  meta: { label: 'Slack', description: 'Post alerts to a Slack channel via an incoming webhook' },
  configSchema: slackChannelConfigSchema,

  async send({ config, event, rendered }): Promise<SendResult> {
    const color = event.type === 'up' ? '#22c55e' : event.type === 'down' ? '#ef4444' : '#64748b';
    const payload = {
      text: rendered.title,
      attachments: [
        {
          color,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `*${rendered.title}*\n${rendered.body}` } },
          ],
        },
      ],
    };
    try {
      const res = await request(config.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      const body = await res.body.text();
      if (res.statusCode === 200 && body === 'ok') return { ok: true };
      const errorKind: 'transient' | 'permanent' =
        res.statusCode === 429 || res.statusCode >= 500 ? 'transient' : 'permanent';
      return { ok: false, errorKind, message: `Slack ${res.statusCode}: ${body.slice(0, 200)}` };
    } catch (err) {
      return { ok: false, errorKind: 'transient', message: err instanceof Error ? err.message : 'send failed' };
    }
  },
};
