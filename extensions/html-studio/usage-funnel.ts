import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

type State = { schema: 1; id: string; lastDay: string; firstSuccess: boolean; returned: boolean; week: string | null };
type EventName = 'first_install' | 'first_launch' | 'first_success' | 'returning_user' | 'weekly_active';
function truthy(name: string): boolean { const value = process.env[name]?.trim().toLowerCase(); return value === '1' || value === 'true' || value === 'yes'; }
function day(now: number) { return new Date(now).toISOString().slice(0, 10); }
function week(now: number) { const d = new Date(now); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); }
function enabled(): URL | undefined {
 if (!truthy('PI_USAGE_TELEMETRY') || !truthy('PI_USAGE_TELEMETRY_PRIVACY_ACK')) return;
 if (truthy('DO_NOT_TRACK') || truthy('PI_TELEMETRY_DISABLED') || truthy('CI') || truthy('GITHUB_ACTIONS')) return;
 try { const url = new URL(process.env.PI_USAGE_TELEMETRY_ENDPOINT || ''); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash ? url : undefined; } catch { return; }
}
function stateFile(packageName: string) { const root = process.platform === 'win32' ? (process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')) : (process.env.XDG_CONFIG_HOME || join(homedir(), '.config')); return join(root, 'liushiyu-usage-funnel', `${createHash('sha256').update(packageName).digest('hex')}.json`); }
async function send(endpoint: URL, event: EventName, state: State, packageName: string, version: string) {
 try { await fetch(endpoint, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(500), body: JSON.stringify({ schema_version: 1, event, event_id: randomUUID(), anonymous_install_id: state.id, package: packageName, version, timestamp: new Date().toISOString(), os: process.platform, node_major: Number(process.versions.node.split('.')[0]), ci: false }) }); } catch { /* at-most-once telemetry: no retries or offline spool */ }
}
export function createUsageFunnel(packageName: string, version: string) {
 let queue = Promise.resolve();
 async function record(success: boolean) {
  const endpoint = enabled(); if (!endpoint) return;
  const file = stateFile(packageName), lock = `${file}.lock`;
  let locked = false, temporary: string | undefined, state: State | undefined;
  const events: EventName[] = [];
  try {
   await mkdir(dirname(file), { recursive: true, mode: 0o700 });
   await mkdir(lock, { mode: 0o700 });
   locked = true;
   try {
    state = JSON.parse(await readFile(file, 'utf8')) as State;
    if (!state || state.schema !== 1 || typeof state.id !== 'string' || typeof state.lastDay !== 'string' || typeof state.firstSuccess !== 'boolean' || typeof state.returned !== 'boolean') return;
   } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return;
   }
   const now = Date.now(), today = day(now), currentWeek = week(now);
   if (!state) { state = { schema: 1, id: randomUUID(), lastDay: today, firstSuccess: false, returned: false, week: null }; events.push('first_install', 'first_launch'); }
   else if (!state.returned && state.lastDay < today) { state.returned = true; events.push('returning_user'); }
   state.lastDay = today;
   if (state.week !== currentWeek) { state.week = currentWeek; events.push('weekly_active'); }
   if (success && !state.firstSuccess) { state.firstSuccess = true; events.push('first_success'); }
   temporary = `${file}.${randomUUID()}.tmp`;
   await writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
   await rename(temporary, file);
   temporary = undefined;
  } catch { return; }
  finally {
   if (temporary) await rm(temporary, { force: true }).catch(() => undefined);
   if (locked) await rm(lock, { recursive: true, force: true }).catch(() => undefined);
  }
  if (state) await Promise.all(events.map((event) => send(endpoint, event, state!, packageName, version)));
 }
 const enqueue = (success: boolean) => { queue = queue.then(() => record(success)).catch(() => undefined); return queue; };
 return { launch: () => enqueue(false), success: () => enqueue(true) };
}
