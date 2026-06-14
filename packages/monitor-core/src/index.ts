/**
 * @pingwatch/monitor-core — `MonitorType` implementations behind the plugin interface from
 * @pingwatch/shared. Each type is a self-contained executor; the engine registry loads them all.
 * (Keyword monitoring is the http type's `keyword` option, not a separate type.)
 */
import type { MonitorType } from '@pingwatch/shared';
import { httpMonitorType } from './http.monitor';
import { tcpMonitorType } from './tcp.monitor';
import { pingMonitorType } from './ping.monitor';
import { dnsMonitorType } from './dns.monitor';
import { sslMonitorType } from './ssl.monitor';

export { httpMonitorType } from './http.monitor';
export { tcpMonitorType } from './tcp.monitor';
export { pingMonitorType } from './ping.monitor';
export { dnsMonitorType } from './dns.monitor';
export { sslMonitorType } from './ssl.monitor';

/** Every monitor type bundled in this build. The engine registry loads these at startup. */
export const builtinMonitorTypes: MonitorType[] = [
  httpMonitorType,
  tcpMonitorType,
  pingMonitorType,
  dnsMonitorType,
  sslMonitorType,
];
