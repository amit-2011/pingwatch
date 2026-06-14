/**
 * @pingwatch/notifications — `NotificationProvider` implementations behind the plugin interface
 * from @pingwatch/shared. Each provider is a self-contained file; the dispatch registry loads them.
 */
import type { NotificationProvider } from '@pingwatch/shared';
import { telegramProvider } from './telegram.provider';
import { slackProvider } from './slack.provider';
import { emailProvider } from './email.provider';

export { telegramProvider, escapeMarkdownV2 } from './telegram.provider';
export { slackProvider } from './slack.provider';
export { emailProvider } from './email.provider';
export { renderNotification } from './templating';

/** Every notification provider bundled in this build. The dispatch registry loads these. */
export const builtinProviders: NotificationProvider[] = [telegramProvider, slackProvider, emailProvider];
