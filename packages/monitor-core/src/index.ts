/**
 * @pingwatch/monitor-core — `MonitorType` implementations behind the plugin interface from
 * @pingwatch/shared. MVP ships `http`; TCP/Ping/DNS/SSL/keyword append here in Phase 2.
 */
import type { MonitorType } from '@pingwatch/shared';
import { httpMonitorType } from './http.monitor';

export { httpMonitorType } from './http.monitor';

/** Every monitor type bundled in this build. The engine registry loads these at startup. */
export const builtinMonitorTypes: MonitorType[] = [httpMonitorType];
