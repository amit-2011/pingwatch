import type { NotificationEvent, NotificationRendered } from '@pingwatch/shared';

/** Default notification copy (PLAN §4.5). Per-channel template overrides land in Phase 2. */
export function renderNotification(event: NotificationEvent): NotificationRendered {
  const target = event.monitor.target ? ` (${event.monitor.target})` : '';
  switch (event.type) {
    case 'up':
      return {
        title: `✅ ${event.monitor.name} is UP`,
        body: `${event.monitor.name}${target} has recovered.`,
      };
    case 'test':
      return {
        title: '🔔 PingWatch test',
        body: `Test alert for "${event.monitor.name}". If you can read this, notifications work.`,
      };
    default:
      return {
        title: `🔴 ${event.monitor.name} is DOWN`,
        body: `${event.monitor.name}${target} is down: ${event.message}`,
      };
  }
}
