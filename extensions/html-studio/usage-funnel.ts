import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createTelemetry, type Telemetry } from '@nyn5255/telemetry';

export const PACKAGE = 'pi-design-mode';
export const COLLECTOR_ENDPOINT = 'https://telemetry-peach.vercel.app/api/events';
export const RETENTION_DAYS = 180;
export const FEATURE = 'design';

export const SENT_FIELDS = [
  'schema_version',
  'event',
  'event_id',
  'anonymous_install_id',
  'package',
  'version',
  'timestamp',
  'os',
  'node_major',
  'ci',
  'feature',
  'week',
] as const;

export const NEVER_SENT = [
  'prompts',
  'design content',
  'tokens.css or components.html contents',
  'file paths',
  'workspace URLs',
  'repository names',
  'tokens',
  'emails',
  'usernames',
  'model output',
  'IP addresses',
] as const;

export type Consent = 'granted' | 'denied' | 'unset';

interface Prefs {
  schema: 1;
  consent: Consent;
  updatedAt?: string;
  collector?: string;
}

const DEFAULT_PREFS: Prefs = { schema: 1, consent: 'unset' };

function truthy(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return !!normalized && normalized !== '0' && normalized !== 'false' && normalized !== 'no';
}

export function prefsPath(): string {
  const root = process.platform === 'win32'
    ? process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
    : process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(root, 'pi-design-mode', 'telemetry.json');
}

function validPrefs(value: unknown): value is Prefs {
  if (!value || typeof value !== 'object') return false;
  const prefs = value as Prefs;
  return prefs.schema === 1 && ['granted', 'denied', 'unset'].includes(prefs.consent);
}

export async function readPrefs(file = prefsPath()): Promise<Prefs> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
    return validPrefs(parsed) ? parsed : { ...DEFAULT_PREFS };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

async function savePrefs(prefs: Prefs, file: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(prefs)}\n`, { mode: 0o600, flag: 'wx' });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function writePrefs(consent: Consent, file = prefsPath()): Promise<void> {
  await savePrefs({
    schema: 1,
    consent,
    updatedAt: new Date().toISOString(),
    collector: COLLECTOR_ENDPOINT,
  }, file);
}

/**
 * Effective consent, highest precedence first:
 * 1. DO_NOT_TRACK / PI_TELEMETRY_DISABLED: always off.
 * 2. PI_DESIGN_MODE_TELEMETRY=0|1: explicit process override.
 * 3. Stored /design-telemetry choice.
 * 4. Legacy PI_USAGE_TELEMETRY + PI_USAGE_TELEMETRY_PRIVACY_ACK pair.
 * 5. Default: denied.
 */
export async function resolveConsent(
  env: NodeJS.ProcessEnv = process.env,
  file = prefsPath(),
): Promise<Consent> {
  if (truthy(env.DO_NOT_TRACK) || truthy(env.PI_TELEMETRY_DISABLED)) return 'denied';

  const override = env.PI_DESIGN_MODE_TELEMETRY?.trim().toLowerCase();
  if (override === '1' || override === 'true') return 'granted';
  if (override === '0' || override === 'false') return 'denied';

  const stored = (await readPrefs(file)).consent;
  if (stored !== 'unset') return stored;

  if (truthy(env.PI_USAGE_TELEMETRY) && truthy(env.PI_USAGE_TELEMETRY_PRIVACY_ACK)) {
    return 'granted';
  }
  return 'denied';
}

export function consentSummary(): string[] {
  return [
    `Collector: ${COLLECTOR_ENDPOINT}`,
    `Fields: ${SENT_FIELDS.join(', ')}`,
    `Never sent: ${NEVER_SENT.join(', ')}`,
    `Retention: pseudonymous rows are deleted after ${RETENTION_DAYS} days.`,
    'Purpose: measure install → activation → first successful design apply → weekly active; D7 is derived by the shared SDK.',
    'Telemetry is off by default. /design-telemetry off revokes immediately.',
    'Hosting note: the collector stores no IP; its hosting platform may retain short-lived technical request logs outside this package.',
  ];
}

export interface UsageFunnel {
  install(): Promise<void>;
  activate(): Promise<void>;
  success(): Promise<void>;
  flush(): Promise<void>;
  disable(): void;
}

export function createUsageFunnel(
  packageName: string,
  version: string,
  consent: Consent,
  options: { stateDirectory?: string; env?: NodeJS.ProcessEnv } = {},
): UsageFunnel {
  const env = options.env ?? process.env;
  const telemetry: Telemetry = createTelemetry({
    package: packageName,
    version,
    enabled: consent === 'granted',
    collectorPrivacyAcknowledged: consent === 'granted',
    endpoint:
      env.PI_DESIGN_MODE_TELEMETRY_ENDPOINT?.trim() ||
      env.PI_USAGE_TELEMETRY_ENDPOINT?.trim() ||
      COLLECTOR_ENDPOINT,
    features: [FEATURE],
    stateDirectory: options.stateDirectory,
    timeoutMs: 1000,
  });

  return {
    install: () => telemetry.install(),
    async activate() {
      await telemetry.activated(FEATURE);
      await telemetry.active(FEATURE);
    },
    success: () => telemetry.success(FEATURE),
    flush: () => telemetry.flush(),
    disable: () => telemetry.disable(),
  };
}
