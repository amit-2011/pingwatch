#!/usr/bin/env node
/**
 * `pingwatch` CLI (the published bin). Commands: `start` (default) and `migrate`.
 * Flags: --port, --data-dir, --config. Config precedence is resolved in config/resolve.
 */
import 'reflect-metadata'; // must load before any NestJS decorator is evaluated
import { cac } from 'cac';
import type { Command } from 'cac';
import { runMigrate, startPingWatch } from './main';
import { runAgent } from './bootstrap/agent';
import { runExport, runImport } from './bootstrap/import';
import type { CliFlags } from './config/resolve';

function normalizeFlags(opts: Record<string, unknown>): CliFlags {
  const flags: CliFlags = {};
  if (opts.port !== undefined) {
    const port = Number(opts.port);
    if (Number.isFinite(port)) flags.port = port;
  }
  if (typeof opts.dataDir === 'string') flags.dataDir = opts.dataDir;
  if (typeof opts.config === 'string') flags.config = opts.config;
  return flags;
}

const cli = cac('pingwatch');

function withStartOptions(command: Command): Command {
  return command
    .option('--port <port>', 'Port to listen on (default 3001)')
    .option('--data-dir <dir>', 'Data directory (default ~/.pingwatch)')
    .option('--config <file>', 'Path to a config file');
}

withStartOptions(cli.command('', 'Start the PingWatch server (default)')).action(
  (opts: Record<string, unknown>) => startPingWatch(normalizeFlags(opts)),
);

withStartOptions(cli.command('start', 'Start the PingWatch server')).action(
  (opts: Record<string, unknown>) => startPingWatch(normalizeFlags(opts)),
);

cli
  .command('migrate', 'Apply database migrations and exit')
  .option('--data-dir <dir>', 'Data directory')
  .option('--config <file>', 'Path to a config file')
  .action((opts: Record<string, unknown>) => runMigrate(normalizeFlags(opts)));

cli
  .command('import <file>', 'Import a YAML config bundle (idempotent upsert)')
  .option('--data-dir <dir>', 'Data directory')
  .option('--config <file>', 'Path to a config file')
  .option('--org <slug>', 'Target organization slug (required if more than one exists)')
  .option('--dry-run', 'Compute the import report without writing any changes')
  .action((file: string, opts: Record<string, unknown>) =>
    runImport(file, {
      ...normalizeFlags(opts),
      ...(typeof opts.org === 'string' ? { org: opts.org } : {}),
      dryRun: opts.dryRun === true,
    }),
  );

cli
  .command('export <file>', 'Export this organization config to a YAML file')
  .option('--data-dir <dir>', 'Data directory')
  .option('--config <file>', 'Path to a config file')
  .option('--org <slug>', 'Source organization slug (required if more than one exists)')
  .action((file: string, opts: Record<string, unknown>) =>
    runExport(file, {
      ...normalizeFlags(opts),
      ...(typeof opts.org === 'string' ? { org: opts.org } : {}),
    }),
  );

cli
  .command('agent', 'Run as a metrics agent — push this host to a PingWatch server')
  .option('--server <url>', 'PingWatch server URL (e.g. https://watch.example.com)')
  .option('--token <token>', 'Agent token (pwt_…)')
  .option('--interval <seconds>', 'Push interval in seconds', { default: '30' })
  .action((opts: Record<string, unknown>) => {
    const server = typeof opts.server === 'string' ? opts.server : '';
    const token = typeof opts.token === 'string' ? opts.token : '';
    if (!server || !token) {
      console.error('[agent] --server and --token are required');
      process.exitCode = 1;
      return undefined;
    }
    return runAgent({ server, token, intervalSeconds: Number(opts.interval ?? 30) });
  });

cli.help();
cli.version('0.0.0');

async function main(): Promise<void> {
  cli.parse(process.argv, { run: false });
  await cli.runMatchedCommand();
}

main().catch((err: unknown) => {
  console.error('[pingwatch] fatal:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
