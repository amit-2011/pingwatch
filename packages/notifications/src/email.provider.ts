import nodemailer from 'nodemailer';
import {
  type EmailChannelConfig,
  type NotificationProvider,
  type SendResult,
  emailChannelConfigSchema,
} from '@pingwatch/shared';

/** Email notifications over the user's own SMTP server via nodemailer (PLAN §4 / P2.5). */
export const emailProvider: NotificationProvider<EmailChannelConfig> = {
  id: 'email',
  meta: { label: 'Email (SMTP)', description: 'Send alerts through your own SMTP server' },
  configSchema: emailChannelConfigSchema,

  async send({ config, rendered }): Promise<SendResult> {
    try {
      const transport = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        ...(config.username
          ? { auth: { user: config.username, pass: config.password ?? '' } }
          : {}),
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
      });
      await transport.sendMail({
        from: config.from,
        to: config.to,
        subject: rendered.title,
        text: rendered.body,
      });
      return { ok: true };
    } catch (err) {
      // 5xx SMTP replies are permanent; connection/4xx errors are transient.
      const responseCode = (err as { responseCode?: number }).responseCode;
      const code = (err as { code?: string }).code;
      const errorKind: 'transient' | 'permanent' =
        responseCode !== undefined && responseCode >= 500 ? 'permanent' : 'transient';
      return { ok: false, errorKind, message: code ?? (err instanceof Error ? err.message : 'send failed') };
    }
  },
};
