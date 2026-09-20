import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  COLLECTOR_ENDPOINT,
  RETENTION_DAYS,
  SENT_FIELDS,
  consentSummary,
  createUsageFunnel,
  readPrefs,
  resolveConsent,
  writePrefs,
} from '../usage-funnel.ts';

const cleanEnv = (): NodeJS.ProcessEnv => ({
  CI: '0',
  GITHUB_ACTIONS: '0',
  GITLAB_CI: '0',
  TF_BUILD: '0',
  JENKINS_URL: '0',
  BUILD_ID: '0',
});

test('telemetry defaults off and stored consent round-trips', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'design-telemetry-consent-'));
  const prefs = join(dir, 'prefs.json');
  t.after(() => rm(dir, { recursive: true, force: true }));

  assert.equal(await resolveConsent(cleanEnv(), prefs), 'denied');
  await writePrefs('granted', prefs);
  assert.equal((await readPrefs(prefs)).consent, 'granted');
  assert.equal(await resolveConsent(cleanEnv(), prefs), 'granted');

  await writePrefs('denied', prefs);
  assert.equal(await resolveConsent(cleanEnv(), prefs), 'denied');
});

test('privacy kill switches override a stored grant', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'design-telemetry-kill-'));
  const prefs = join(dir, 'prefs.json');
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writePrefs('granted', prefs);

  assert.equal(await resolveConsent({ ...cleanEnv(), DO_NOT_TRACK: '1' }, prefs), 'denied');
  assert.equal(await resolveConsent({ ...cleanEnv(), PI_TELEMETRY_DISABLED: '1' }, prefs), 'denied');
  assert.equal(await resolveConsent({ ...cleanEnv(), PI_DESIGN_MODE_TELEMETRY: '0' }, prefs), 'denied');
  assert.equal(await resolveConsent({ ...cleanEnv(), PI_DESIGN_MODE_TELEMETRY: '1' }, prefs), 'granted');
});

test('disclosure names collector, exact fields, retention and default-off contract', () => {
  const text = consentSummary().join('\n');
  assert.equal(text.includes(COLLECTOR_ENDPOINT), true);
  assert.equal(text.includes(String(RETENTION_DAYS)), true);
  assert.match(text, /off by default/i);
  for (const field of SENT_FIELDS) assert.equal(text.includes(field), true);
  assert.equal(text.includes('design content'), true);
  assert.equal(text.includes('IP addresses'), true);
});

test('debug inspection exposes intended design funnel without sending or consuming state', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'design-telemetry-wire-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const previousDebug = process.env.PI_TELEMETRY_DEBUG;
  const previousCI = process.env.CI;
  process.env.PI_TELEMETRY_DEBUG = '1';
  process.env.CI = '0';

  const lines: string[] = [];
  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    const text = String(chunk);
    if (text.startsWith('[telemetry:debug] ')) lines.push(text.trim());
    return true;
  }) as typeof process.stderr.write;

  try {
    const funnel = createUsageFunnel('pi-design-mode', '0.3.4', 'granted', {
      stateDirectory: dir,
      env: { ...cleanEnv(), PI_TELEMETRY_DEBUG: '1' },
    });
    await funnel.install();
    await funnel.activate();
    await funnel.success();
    await funnel.flush();
  } finally {
    process.stderr.write = originalWrite as typeof process.stderr.write;
    if (previousDebug === undefined) delete process.env.PI_TELEMETRY_DEBUG;
    else process.env.PI_TELEMETRY_DEBUG = previousDebug;
    if (previousCI === undefined) delete process.env.CI;
    else process.env.CI = previousCI;
  }

  const payloads = lines.map(line => JSON.parse(line.slice('[telemetry:debug] '.length)));
  assert.deepEqual(payloads.map(p => p.event), [
    'install',
    'activated',
    'weekly_active',
    'first_success',
    'weekly_active',
  ]);
  for (const payload of payloads) {
    assert.equal(payload.package, 'pi-design-mode');
    assert.equal(payload.version, '0.3.4');
    assert.equal(payload.ci, false);
    if (payload.event === 'install') assert.equal(payload.feature, undefined);
    else assert.equal(payload.feature, 'design');
  }
  assert.equal((await readdir(dir)).filter(name => name.endsWith('.json')).length, 0);
});
