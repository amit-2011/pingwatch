#!/usr/bin/env node
/**
 * `pingwatch` CLI (the published bin). Commands: `start` (default) and `migrate`.
 * Flags: --port, --data-dir, --config. Config precedence is resolved in config/resolve.
 */
import { cac } from 'cac';
import type { Command } from 'cac';
import { runMigrate, startPingWatch } from './main';
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
