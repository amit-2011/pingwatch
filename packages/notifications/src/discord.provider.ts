import {
  type DiscordChannelConfig,
  type NotificationProvider,
  type SendResult,
  discordChannelConfigSchema,
} from '@pingwatch/shared';
import { classifyHttp, postJson } from './http';

/** Embed color by event type — green up, red down, slate otherwise. */
function color(eventType: string): number {
  return eventType === 'up' ? 0x22c55e : eventType === 'down' ? 0xef4444 : 0x64748b;
}

/** Discord incoming-webhook notifications with a colored embed (P4.4). */
export const discordProvider: NotificationProvider<DiscordChannelConfig> = {
  id: 'discord',
  meta: { label: 'Discord', description: 'Post alerts to a Discord channel via an incoming webhook' },
  configSchema: discordChannelConfigSchema,

  async send({ config, event, rendered }): Promise<SendResult> {
    const payload = {
      ...(config.username ? { username: config.username } : {}),
      ...(config.avatarUrl ? { avatar_url: config.avatarUrl } : {}),
      embeds: [{ title: rendered.title, description: rendered.body, color: color(event.type) }],
    };
    try {
      const res = await postJson(config.webhookUrl, payload);
      // Discord returns 204 No Content on success (200 with ?wait=true).
      if (res.statusCode === 204 || res.statusCode === 200) return { ok: true };
      const body = await res.text();
      return { ok: false, errorKind: classifyHttp(res.statusCode), message: `Discord ${res.statusCode}: ${body.slice(0, 200)}` };
    } catch (err) {
      return { ok: false, errorKind: 'transient', message: err instanceof Error ? err.message : 'send failed' };
    }
  },
};
