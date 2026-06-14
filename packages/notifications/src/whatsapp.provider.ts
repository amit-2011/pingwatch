import {
  type NotificationProvider,
  type SendResult,
  type WhatsAppChannelConfig,
  whatsappChannelConfigSchema,
} from '@pingwatch/shared';
import { classifyHttp, postJson } from './http';

// Overridable for tests; defaults to the real WhatsApp Cloud API (Meta Graph).
const API_BASE = process.env.PINGWATCH_WHATSAPP_API_BASE ?? 'https://graph.facebook.com';
const API_VERSION = 'v21.0';

/**
 * WhatsApp Cloud API notifications (P4.4) — text messages only. Business-initiated sends are
 * subject to Meta's 24h customer-service-window + template rules; a rejection surfaces as the
 * provider's verbatim error message (a permanent 4xx), which is an account constraint, not a bug.
 */
export const whatsappProvider: NotificationProvider<WhatsAppChannelConfig> = {
  id: 'whatsapp',
  meta: { label: 'WhatsApp', description: 'Send WhatsApp messages via the WhatsApp Cloud API' },
  configSchema: whatsappChannelConfigSchema,

  async send({ config, rendered }): Promise<SendResult> {
    const url = `${API_BASE}/${API_VERSION}/${config.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to: config.to,
      type: 'text',
      text: { body: `${rendered.title}\n${rendered.body}` },
    };
    try {
      const res = await postJson(url, payload, { headers: { authorization: `Bearer ${config.accessToken}` } });
      if (res.statusCode === 200) return { ok: true };
      const body = await res.text();
      return { ok: false, errorKind: classifyHttp(res.statusCode), message: `WhatsApp ${res.statusCode}: ${body.slice(0, 200)}` };
    } catch (err) {
      return { ok: false, errorKind: 'transient', message: err instanceof Error ? err.message : 'send failed' };
    }
  },
};
