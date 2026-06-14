/**
 * @pingwatch/notifications — `NotificationProvider` implementations behind the plugin interface
 * from @pingwatch/shared. MVP ships Telegram; Slack/Email and more append here in Phase 2/4.
 */
import type { NotificationProvider } from '@pingwatch/shared';
import { telegramProvider } from './telegram.provider';

export { telegramProvider, escapeMarkdownV2 } from './telegram.provider';
export { renderNotification } from './templating';

/** Every notification provider bundled in this build. The dispatch registry loads these. */
export const builtinProviders: NotificationProvider[] = [telegramProvider];
