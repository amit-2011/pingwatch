#!/usr/bin/env node
/**
 * Set the version on every publishable workspace package (P4.1) before `pnpm -r publish`.
 * Usage: node scripts/set-version.mjs <version>
 *
 * The published `pingwatch` package depends on the @pingwatch/* libs via `workspace:*`; pnpm
 * rewrites those to the real version at publish time, so all packages must share one version.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error('[set-version] usage: node scripts/set-version.mjs <semver>');
  process.exit(1);
}

// The publishable packages (the libs + the server, which publishes as `pingwatch`).
const PACKAGES = [
  'packages/shared',
  'packages/db',
  'packages/monitor-core',
  'packages/notifications',
  'apps/web',
  'apps/server',
];

for (const dir of PACKAGES) {
  const pjPath = join(ROOT, dir, 'package.json');
  const pj = JSON.parse(readFileSync(pjPath, 'utf8'));
  pj.version = version;
  writeFileSync(pjPath, JSON.stringify(pj, null, 2) + '\n');
  console.log(`[set-version] ${pj.name} → ${version}`);
}
