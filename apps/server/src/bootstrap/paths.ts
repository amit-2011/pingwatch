import fs from 'node:fs';

/** Ensure the data directory exists (idempotent). Backup = copy this one folder (PLAN §1.5). */
export function ensureDataDir(dataDir: string): void {
  fs.mkdirSync(dataDir, { recursive: true });
}
