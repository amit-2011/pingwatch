import { request } from 'undici';
import {
  type NotificationEvent,
  type NotificationProvider,
  type NotificationRendered,
  type SendResult,
  type SlackChannelConfig,
  slackChannelConfigSchema,
} from '@pingwatch/shared';

/** Attachment bar color — green up, red down, slate otherwise. */
function attachmentColor(eventType: string): string {
  return eventType === 'up' ? '#2eb886' : eventType === 'down' ? '#e01e5a' : '#64748b';
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** Readable, deterministic timestamp (UTC) from the event's ISO `occurredAt`. */
function formatOccurredAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')}`;
}

/**
 * Build the Block Kit blocks — state-first header, a human summary line, a facts grid, the
 * rendered details, optional action buttons, and a branded footer. Mapped onto PingWatch's
 * NotificationEvent shape.
 */
function buildBlocks(event: NotificationEvent, rendered: NotificationRendered): unknown[] {
  const isUp = event.type === 'up';
  const statusEmoji = isUp ? '🟢' : event.type === 'down' ? '🔴' : '⚪';
  const statusLabel = event.status.toUpperCase();
  const headline = isUp ? 'Service Recovered' : event.type === 'down' ? 'Service Down' : 'Status Update';

  const blocks: unknown[] = [];

  // header — state-first so the situation reads at a glance, even in a busy channel
  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: rendered.title, emoji: true },
  });

  // a short, human summary line right under the header
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: isUp
          ? `✨ *${headline}* · everything is back to normal`
          : event.type === 'down'
            ? `🚨 *${headline}* · needs attention`
            : `ℹ️ *${headline}*`,
      },
    ],
  });

  blocks.push({ type: 'divider' });

  // a clean grid of the most relevant facts
  const fields: Array<{ type: 'mrkdwn'; text: string }> = [
    { type: 'mrkdwn', text: `*Status*\n${statusEmoji} ${statusLabel}` },
    { type: 'mrkdwn', text: `*🕒 Time (UTC)*\n${formatOccurredAt(event.occurredAt)}` },
  ];

  const address = event.monitor.target;

  blocks.push({ type: 'section', fields });

  // the human-readable message as its own full-width section
  if (rendered.body) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*📝 Details*\n${rendered.body}` } });
  }

  // action buttons — a dashboard deep-link (when a public base URL is configured) and the endpoint
  const actions: unknown[] = [];
  const baseUrl = process.env.PINGWATCH_PUBLIC_URL?.replace(/\/$/, '');
  if (baseUrl) {
    actions.push({
      type: 'button',
      text: { type: 'plain_text', text: '📊 Open Dashboard', emoji: true },
      style: 'primary',
      value: 'PingWatch',
      url: `${baseUrl}/monitors/${event.monitor.id}`,
    });
  }
  if (address && isHttpUrl(address)) {
    actions.push({
      type: 'button',
      text: { type: 'plain_text', text: '🔗 Visit Endpoint', emoji: true },
      value: 'Endpoint',
      url: address,
    });
  }
  if (actions.length > 0) {
    blocks.push({ type: 'actions', elements: actions });
  }

  // a subtle branded footer
  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: isUp ? '🛡️ Recovered & monitored by *PingWatch*' : '🛡️ Detected & monitored by *PingWatch*',
      },
    ],
  });

  return blocks;
}

/**
 * Slack incoming-webhook notifications with a rich, colored Block Kit attachment (PLAN §4 / P2.4).
 * Blocks live inside a single `attachment` so Slack renders the colored status bar down the left
 * edge (the only way to get it — Block Kit has no top-level color). Note: on an incoming webhook
 * this attachment also makes Slack append its "Added by <app>" attribution line — the two are
 * inseparable through the payload; that label is controlled by the Slack app's own name.
 */
export const slackProvider: NotificationProvider<SlackChannelConfig> = {
  id: 'slack',
  meta: { label: 'Slack', description: 'Post alerts to a Slack channel via an incoming webhook' },
  configSchema: slackChannelConfigSchema,

  async send({ config, event, rendered }): Promise<SendResult> {
    const payload = {
      attachments: [
        {
          color: attachmentColor(event.type),
          blocks: buildBlocks(event, rendered),
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
