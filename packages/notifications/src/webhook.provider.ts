import {
  type NotificationProvider,
  type SendResult,
  type WebhookChannelConfig,
  webhookChannelConfigSchema,
} from '@pingwatch/shared';
import { classifyHttp, postJson } from './http';

/** Generic JSON webhook — POSTs a stable, documented payload to any HTTP endpoint (P4.4). */
export const webhookProvider: NotificationProvider<WebhookChannelConfig> = {
  id: 'webhook',
  meta: { label: 'Webhook', description: 'POST a JSON payload to any HTTP endpoint' },
  configSchema: webhookChannelConfigSchema,

  async send({ config, event, rendered }): Promise<SendResult> {
    const payload = {
      event: event.type,
      status: event.status,
      message: event.message,
      occurredAt: event.occurredAt,
      title: rendered.title,
      body: rendered.body,
      monitor: event.monitor,
      ...(event.incidentId ? { incidentId: event.incidentId } : {}),
    };
    try {
      const res = await postJson(config.url, payload, {
        method: config.method,
        ...(config.headers ? { headers: config.headers } : {}),
      });
      if (res.statusCode >= 200 && res.statusCode < 300) return { ok: true };
      const body = await res.text();
      return { ok: false, errorKind: classifyHttp(res.statusCode), message: `Webhook ${res.statusCode}: ${body.slice(0, 200)}` };
    } catch (err) {
      return { ok: false, errorKind: 'transient', message: err instanceof Error ? err.message : 'send failed' };
    }
  },
};
