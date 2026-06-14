import {
  type NotificationProvider,
  type SendResult,
  type TwilioChannelConfig,
  twilioChannelConfigSchema,
} from '@pingwatch/shared';
import { classifyHttp, postForm } from './http';

// Overridable for tests; defaults to the real Twilio API.
const API_BASE = process.env.PINGWATCH_TWILIO_API_BASE ?? 'https://api.twilio.com';

/** Twilio SMS notifications (P4.4) via the REST API with HTTP Basic auth. */
export const twilioProvider: NotificationProvider<TwilioChannelConfig> = {
  id: 'twilio',
  meta: { label: 'Twilio SMS', description: 'Send SMS alerts via Twilio' },
  configSchema: twilioChannelConfigSchema,

  async send({ config, rendered }): Promise<SendResult> {
    const url = `${API_BASE}/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
    const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');
    try {
      const res = await postForm(
        url,
        { From: config.from, To: config.to, Body: `${rendered.title}\n${rendered.body}` },
        { headers: { authorization: `Basic ${auth}` } },
      );
      if (res.statusCode === 201 || res.statusCode === 200) return { ok: true };
      const body = await res.text();
      return { ok: false, errorKind: classifyHttp(res.statusCode), message: `Twilio ${res.statusCode}: ${body.slice(0, 200)}` };
    } catch (err) {
      return { ok: false, errorKind: 'transient', message: err instanceof Error ? err.message : 'send failed' };
    }
  },
};
