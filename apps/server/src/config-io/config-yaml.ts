import { parse, stringify } from 'yaml';
import { type ConfigBundle, configBundleSchema } from '@pingwatch/shared';

/** Single home for the `yaml` dependency — import/export and the CLI share these two helpers. */

const HEADER = `# PingWatch config bundle — version-controllable config-as-code (P4.6).
# Channel secrets are REDACTED by default; fill in plaintext secret blocks before importing
# to a fresh instance. Import is idempotent (upsert by slug / name / title).
`;

export function toYaml(bundle: ConfigBundle): string {
  return HEADER + stringify(bundle, { sortMapEntries: false });
}

export function fromYaml(text: string): ConfigBundle {
  const raw: unknown = parse(text);
  return configBundleSchema.parse(raw);
}
