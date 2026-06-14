import {
  type GotifyChannelConfig,
  type NotificationProvider,
  type SendResult,
  gotifyChannelConfigSchema,
} from '@pingwatch/shared';
import { classifyHttp, postJson } from './http';

/** Gotify notifications to a self-hosted server (P4.4). Token goes in a header, never the URL. */
export const gotifyProvider: NotificationProvider<GotifyChannelConfig> = {
  id: 'gotify',
  meta: { label: 'Gotify', description: 'Send alerts to a self-hosted Gotify server' },
  configSchema: gotifyChannelConfigSchema,

  async send({ config, rendered }): Promise<SendResult> {
    const url = `${config.serverUrl.replace(/\/$/, '')}/message`;
    const payload = { title: rendered.title, message: rendered.body, priority: config.priority };
    try {
      const res = await postJson(url, payload, { headers: { 'x-gotify-key': config.appToken } });
      if (res.statusCode === 200) return { ok: true };
      const body = await res.text();
      return { ok: false, errorKind: classifyHttp(res.statusCode), message: `Gotify ${res.statusCode}: ${body.slice(0, 200)}` };
    } catch (err) {
      return { ok: false, errorKind: 'transient', message: err instanceof Error ? err.message : 'send failed' };
    }
  },
};
