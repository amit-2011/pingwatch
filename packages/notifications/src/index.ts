/**
 * @pingwatch/notifications — `NotificationProvider` implementations behind the plugin interface
 * from @pingwatch/shared. Each provider is a self-contained file; the dispatch registry loads them.
 */
import type { NotificationProvider } from '@pingwatch/shared';
import { telegramProvider } from './telegram.provider';
import { slackProvider } from './slack.provider';
import { emailProvider } from './email.provider';
import { discordProvider } from './discord.provider';
import { webhookProvider } from './webhook.provider';
import { msTeamsProvider } from './msteams.provider';
import { pushoverProvider } from './pushover.provider';
import { gotifyProvider } from './gotify.provider';
import { twilioProvider } from './twilio.provider';
import { whatsappProvider } from './whatsapp.provider';

export { telegramProvider, escapeMarkdownV2 } from './telegram.provider';
export { slackProvider } from './slack.provider';
export { emailProvider } from './email.provider';
export { discordProvider } from './discord.provider';
export { webhookProvider } from './webhook.provider';
export { msTeamsProvider } from './msteams.provider';
export { pushoverProvider } from './pushover.provider';
export { gotifyProvider } from './gotify.provider';
export { twilioProvider } from './twilio.provider';
export { whatsappProvider } from './whatsapp.provider';
export { renderNotification } from './templating';
export { classifyHttp, postJson, postForm } from './http';

/** Every notification provider bundled in this build. The dispatch registry loads these. */
export const builtinProviders: NotificationProvider[] = [
  telegramProvider,
  slackProvider,
  emailProvider,
  discordProvider,
  webhookProvider,
  msTeamsProvider,
  pushoverProvider,
  gotifyProvider,
  twilioProvider,
  whatsappProvider,
];
