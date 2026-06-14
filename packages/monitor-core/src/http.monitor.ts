import { Readable } from 'node:stream';
import { Agent, interceptors, request } from 'undici';
import {
  type CheckResult,
  type HttpMonitorConfig,
  type MonitorCheckContext,
  type MonitorType,
  httpMonitorConfigSchema,
} from '@pingwatch/shared';

const KEYWORD_READ_CAP = 1_000_000; // ~1 MB — cap body reads when keyword-matching
const secureAgent = new Agent();
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

/** Match an HTTP status against assertions like "200", "200-299", or "2XX". */
function matchStatus(code: number, assertions: string[]): boolean {
  return assertions.some((assertion) => {
    const family = /^([1-5])xx$/i.exec(assertion);
    if (family) return Math.floor(code / 100) === Number(family[1]);
    const range = /^(\d{3})(?:-(\d{3}))?$/.exec(assertion);
    if (!range) return false;
    const low = Number(range[1]);
    const high = range[2] ? Number(range[2]) : low;
    return code >= low && code <= high;
  });
}

async function readCapped(body: Readable, cap: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    const buf = chunk as Buffer;
    chunks.push(buf);
    total += buf.length;
    if (total >= cap) {
      body.destroy();
      break;
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    return code ?? err.message;
  }
  return 'Request failed';
}

/** HTTP/HTTPS uptime monitor (PLAN §3.3). Stateless: returns `down` on any failure, never throws. */
export const httpMonitorType: MonitorType<HttpMonitorConfig> = {
  type: 'http',
  configSchema: httpMonitorConfigSchema,

  validateConfig(raw: unknown): HttpMonitorConfig {
    return httpMonitorConfigSchema.parse(raw);
  },

  async check(ctx: MonitorCheckContext<HttpMonitorConfig>): Promise<CheckResult> {
    const { config, signal, now } = ctx;
    const start = now();
    try {
      const baseAgent = config.ignoreTls ? insecureAgent : secureAgent;
      const dispatcher = config.followRedirects
        ? baseAgent.compose(interceptors.redirect({ maxRedirections: config.maxRedirects }))
        : baseAgent;
      const res = await request(config.url, {
        method: config.method,
        signal,
        dispatcher,
        ...(config.headers ? { headers: config.headers } : {}),
      });
      const responseTimeMs = Math.round(now() - start);
      const { statusCode } = res;

      if (!matchStatus(statusCode, config.expectedStatus)) {
        await res.body.dump();
        return { status: 'down', responseTimeMs, statusCode, message: `Unexpected status ${statusCode}` };
      }

      if (config.keyword !== undefined) {
        const body = await readCapped(res.body as unknown as Readable, KEYWORD_READ_CAP);
        const present = body.includes(config.keyword);
        const ok = config.keywordInverted ? !present : present;
        if (!ok) {
          return {
            status: 'down',
            responseTimeMs,
            statusCode,
            message: config.keywordInverted
              ? `Keyword "${config.keyword}" unexpectedly present`
              : `Keyword "${config.keyword}" not found`,
          };
        }
      } else {
        await res.body.dump();
      }

      return { status: 'up', responseTimeMs, statusCode, message: `${statusCode} in ${responseTimeMs}ms` };
    } catch (err) {
      return { status: 'down', responseTimeMs: Math.round(now() - start), message: errorMessage(err) };
    }
  },
};
