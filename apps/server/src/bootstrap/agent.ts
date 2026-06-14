import si from 'systeminformation';

export interface AgentOptions {
  server: string;
  token: string;
  intervalSeconds: number;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

async function collect(): Promise<Record<string, number>> {
  const [load, mem, fs, net] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.networkStats(),
  ]);
  return {
    cpuPct: round(load.currentLoad),
    memPct: round((mem.active / mem.total) * 100),
    diskPct: fs.length > 0 ? round(Math.max(...fs.map((f) => f.use))) : 0,
    netInKbps: round(net.reduce((s, n) => s + Math.max(0, n.rx_sec ?? 0), 0) / 1024),
    netOutKbps: round(net.reduce((s, n) => s + Math.max(0, n.tx_sec ?? 0), 0) / 1024),
  };
}

/**
 * Run PingWatch in agent mode (P3.3): collect this host's metrics and push them to a PingWatch
 * server with the agent token. Same `pingwatch` binary, just `pingwatch agent` on the remote host.
 */
export async function runAgent(opts: AgentOptions): Promise<void> {
  const url = `${opts.server.replace(/\/$/, '')}/api/agent/metrics`;
  const push = async (): Promise<void> => {
    try {
      const body = await collect();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.token}` },
        body: JSON.stringify(body),
      });
      console.log(
        res.ok
          ? `[agent] pushed CPU ${body.cpuPct}% · MEM ${body.memPct}% · Disk ${body.diskPct}%`
          : `[agent] push failed: HTTP ${res.status}`,
      );
    } catch (err) {
      console.error('[agent] error:', err instanceof Error ? err.message : err);
    }
  };
  console.log(`[agent] pushing to ${url} every ${opts.intervalSeconds}s`);
  await push();
  setInterval(() => void push(), opts.intervalSeconds * 1000);
}
