import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sdk = process.env.PI_SDK_ROOT || resolve('../../node_modules/@earendil-works/pi-coding-agent');
const require = createRequire(join(sdk, 'package.json'));
const { createJiti } = require('jiti');
const jiti = createJiti(import.meta.url, { interopDefault: false, alias: {
  'typebox': require.resolve('typebox'), 'typebox/value': require.resolve('typebox/value'),
  '@earendil-works/pi-ai': join(sdk, 'node_modules/@earendil-works/pi-ai/dist/index.js'),
  '@earendil-works/pi-coding-agent': join(sdk, 'dist/index.js'),
} });
const { default: designMode } = await jiti.import('./index.ts');
const { DesignStore, newState, restoreState, emptyBrief } = await jiti.import('./core.ts');
const { validateSvg, updateRegions, hash } = await jiti.import('./svg.ts');
const { ManageSchema, RenderSchema, parse } = await jiti.import('./schema.ts');
const brief = { user: '运营', scenario: '晨会', goal: '快速确认异常', must: ['主要操作'], mustNot: ['外部资源'], direction: '清晰紧凑' };
const screen = (title = '概览', color = '#ffffff') => `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240"><svg id="header" x="0" y="0" width="320" height="80" viewBox="0 0 320 80" overflow="hidden"><rect width="320" height="80" fill="#172640"/><text x="12" y="45" fill="#ffffff" font-size="20">${title}</text></svg><svg id="body" x="0" y="80" width="320" height="160" viewBox="0 0 320 160" overflow="hidden"><rect width="320" height="160" fill="${color}"/><text x="12" y="45" font-size="18">确认</text></svg></svg>`;
const legacy = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#ffffff"/><text x="16" y="50">Legacy</text></svg>';
const body = '<rect width="320" height="160" fill="#edf2fa"/><text x="12" y="50" font-size="22">立即确认</text>';
function exec(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { signal: options.signal });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeout || 30000);
    child.stdout.on('data', (data) => stdout += data);
    child.stderr.on('data', (data) => stderr += data);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr, killed: Boolean(signal) }); });
  });
}
async function directory(t) {
  const path = await mkdtemp(join(resolve('.'), '.design-test-'));
  if (process.env.DESIGN_TEST_KEEP === '1') console.log(`保留测试产物：${path}`);
  else t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
async function harness(t, run = exec) {
  const home = await directory(t), entries = [], tools = new Map(), commands = new Map(), events = new Map();
  let activeTools = ['read', 'bash', 'other_tool'], sessionId = 'session-a', confirmed = true;
  const pi = {
    exec: run, registerTool: (tool) => tools.set(tool.name, tool), registerCommand: (name, command) => commands.set(name, command),
    on: (name, handler) => events.set(name, handler), appendEntry: (customType, data) => entries.push({ type: 'custom', customType, data: structuredClone(data) }),
    getActiveTools: () => activeTools, setActiveTools: (value) => activeTools = value, sendUserMessage: () => {},
  };
  const ctx = { hasUI: true, mode: 'tui', sessionManager: { getSessionId: () => sessionId, getBranch: () => entries }, waitForIdle: async () => {},
    ui: { setStatus() {}, theme: { fg: (_, text) => text }, notify() {}, editor: async () => undefined, confirm: async () => confirmed } };
  function load() { const old = process.env.HOME; process.env.HOME = home; try { designMode(pi); } finally { if (old === undefined) delete process.env.HOME; else process.env.HOME = old; } }
  load();
  const call = (name, params, signal) => tools.get(name).execute('test', params, signal, undefined, ctx);
  const current = () => entries.at(-1)?.data;
  const event = (name, value = {}) => events.get(name)?.(value, ctx);
  await event('session_start');
  return { home, pi, entries, tools, commands, events, ctx, load, call, current, event, activeTools: () => activeTools, setSession: (id) => sessionId = id, confirm: (value) => confirmed = value,
    start: () => commands.get('design').handler(JSON.stringify(brief), ctx) };
}

test('SVG 安全：拒绝主动内容、CSS、实体、命名空间、非法XML、重复id与超限', () => {
  validateSvg(legacy); validateSvg(screen());
  const unsafe = [
    '<script/>', '<foreignObject/>', '<image href="https://x"/>', '<use href="#header"/>', '<style>@import "x";</style>',
    '<g onclick="x"/>', '<g onload = "x"/>', '<g style="fill:red"/>', '<g xml:base="https://x"/>',
    '<rect fill="url(https://x)"/>', '<rect fill="URL(#header)"/>', '<rect fill="url(&#35;header)"/>',
    '<g xmlns="http://evil"/>', '<g id="x" id="y"/>', '<g id="x"/><g id="x"/>', '<g>', '<rect width=10/>',
    '<text>&#x3c;script&gt;</text>', '<text>&bogus;</text>', '<text>bad &</text>', '<text>\u0000</text>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>', '<?xml-stylesheet href="http://x"?>',
    '<text><![CDATA[abc]]></text>', '<g href="&#x68;ttps://x"/>',
  ];
  for (const source of unsafe) assert.throws(() => validateSvg(legacy.replace('</svg>', `${source}</svg>`)), source);
  for (const source of [legacy + legacy, legacy + '<', legacy.replace('width="320"', 'width="5000"'), '<svg/>', 'x'.repeat(1_500_001)]) assert.throws(() => validateSvg(source));
});

test('区域：局部更新成功，保护字节保持；重叠/跨区引用/边界逃逸拒绝', () => {
  const before = validateSvg(screen());
  const after = validateSvg(updateRegions(before, [{ id: 'body', content: body }], ['header']));
  assert.equal(before.svg.slice(before.regions[0].start, before.regions[0].end), after.svg.slice(after.regions[0].start, after.regions[0].end));
  assert.throws(() => updateRegions(before, [{ id: 'header', content: body }], ['header']));
  assert.throws(() => updateRegions(before, [{ id: 'body', content: '</svg><svg id="body" x="0" y="0" width="320" height="240" overflow="visible">' }], ['header']));
  assert.throws(() => validateSvg(screen().replace('y="80"', 'y="70"')));
  assert.throws(() => validateSvg(screen().replace('overflow="hidden"', 'overflow="visible"')));
  assert.throws(() => validateSvg(screen().replace('<rect width="320" height="80"', '<rect transform="translate(0 0)" width="320" height="80"').replace('<svg id="header"', '<svg transform="translate(0 0)" id="header"')));
  const cross = screen().replace('<rect width="320" height="80"', '<defs><linearGradient id="paint"><stop offset="0" stop-color="#ffffff"/></linearGradient></defs><rect width="320" height="80"').replace('fill="#ffffff"/><text x="12" y="45" font-size', 'fill="url(#paint)"/><text x="12" y="45" font-size');
  assert.throws(() => validateSvg(cross), /跨区域/);
  assert.throws(() => updateRegions(before, [{ id: 'body', content: '<svg id="escape"/>' }], ['header']));
});

test('真实 sips：brief、2方向、选择、批准/锁定、局部revision、compare、规范、五维评审、flow', async (t) => {
  const h = await harness(t);
  await h.start();
  assert.equal(h.current().briefReady, true);
  assert(h.activeTools().includes('other_tool'));
  const result = await h.call('design_render', { directions: [{ id: 'a', label: '概览', svg: screen() }, { id: 'b', label: '聚焦', svg: screen('聚焦', '#eaf0fa') }] });
  assert.equal(result.content.filter((c) => c.type === 'image').length, 2);
  assert.equal(h.current().revision, 1); assert.equal(h.current().selected, null);
  await assert.rejects(h.call('design_render', { svg: screen() }), /先用/);
  await h.call('design_manage', { action: 'select', artifact: 'a' });
  await h.call('design_manage', { action: 'protect', regions: ['header'], status: 'approved' });
  await h.call('design_manage', { action: 'protect', regions: ['header'], status: 'locked' });
  const locked = structuredClone(h.current());
  for (const input of [{ svg: screen('偷偷换主题') }, { updates: [{ id: 'header', content: body }] }, { updates: [{ id: 'body', content: '<g style="display:none"/>' }] }]) {
    await assert.rejects(h.call('design_render', input)); assert.deepEqual(h.current(), locked);
  }
  h.confirm(false);
  await assert.rejects(h.call('design_manage', { action: 'protect', regions: ['header'], status: 'editable' }), /取消/);
  assert.deepEqual(h.current(), locked); h.confirm(true);
  const updated = await h.call('design_render', { updates: [{ id: 'body', content: body }], note: '只调整主体操作' });
  assert.deepEqual(updated.details.changed, ['body']); assert.deepEqual(updated.details.preserved, ['header']);
  const revision = h.current().history.at(-1);
  assert.equal(revision.base.svgPath, locked.selected.svgPath); assert.equal(h.current().revision, 2);
  const before = await readFile(join(h.home, '.pi/agent/designs', locked.selected.svgPath), 'utf8');
  const after = await readFile(updated.details.svgPath, 'utf8');
  assert.equal(validateSvg(before).regions[0].attrs.id, 'header'); assert(after.includes('立即确认'));
  const comparison = await h.call('design_manage', { action: 'compare' });
  assert.equal(comparison.content.filter((c) => c.type === 'image').length, 2);
  const spec = { colors: [{ role: '主色', value: '#172640' }], typography: [{ role: '标题', family: 'Arial', size: 20, weight: 600 }], spacing: [8, 16, 24], radii: [8, 12], components: [{ name: '按钮', rule: '只设一个主操作' }] };
  const specResult = await h.call('design_manage', { action: 'spec', spec });
  assert.deepEqual(JSON.parse(await readFile(join(specResult.details.recordPath, '../design-spec.json'), 'utf8')), spec);
  const review = { author: 'assistant', items: ['Intent', 'Hierarchy', 'Clarity', 'Consistency', 'Feasibility'].map((dimension) => ({ dimension, finding: '主操作明确；待人工看图确认', evidence: [{ region: 'body', quote: '立即确认' }], next: '用 read 看图检查文字与尺寸' })) };
  await h.call('design_manage', { action: 'review', review });
  await assert.rejects(h.call('design_manage', { action: 'review', review: { ...review, items: review.items.map((r) => ({ ...r, evidence: [{ region: 'body', quote: '不存在' }] })) } }), /证据不匹配/);
  const selected = h.current().selected.svgPath;
  const flow = await h.call('design_render', { name: 'flow', flow: { nodes: [{ id: 'overview', label: '概览', artifact: 'a' }, { id: 'focus', label: '聚焦', artifact: 'b' }], edges: [{ from: 'overview', to: 'focus', label: '查看详情' }] } });
  assert.equal(h.current().selected.svgPath, selected); assert.equal(h.current().revision, 3);
  assert((await readFile(flow.details.svgPath, 'utf8')).includes('查看详情'));
  assert.equal(h.current().history.at(-1).kind, 'flow');
  assert.equal(restoreState(h.current()).revision, 3);
  const history = await h.call('design_manage', { action: 'history' }); assert(history.content[0].text.includes('已保存') === false);
});

test('提交前失败可清理；进入append后抛错保留产物并核对分支', async (t) => {
  let conversions = 0, mode = 'batch-fail';
  const h = await harness(t, async (command, args, options) => {
    if (command.endsWith('sips')) {
      conversions++;
      if (mode === 'batch-fail' && conversions === 2) return { code: 1, stderr: 'test failure', stdout: '', killed: false };
      if (mode === 'bad-png') { await writeFile(args.at(-1), 'not png'); return { code: 0, stderr: '', stdout: '', killed: false }; }
    }
    return exec(command, args, options);
  });
  await h.start(); const initial = structuredClone(h.current());
  await assert.rejects(h.call('design_render', { directions: [{ id: 'a', label: 'A', svg: screen() }, { id: 'b', label: 'B', svg: screen('B') }] }), /test failure/);
  assert.deepEqual(h.current(), initial);
  const document = join(h.home, '.pi/agent/designs', hash('session-a').slice(0, 24), initial.document);
  assert.equal((await readdir(document)).length, 1); // only the initial brief record
  mode = 'bad-png'; await assert.rejects(h.call('design_render', { svg: legacy }), /不是 PNG/); assert.deepEqual(h.current(), initial);
  const abort = new AbortController(); abort.abort(); await assert.rejects(h.call('design_render', { svg: legacy }, abort.signal)); assert.deepEqual(h.current(), initial);
  mode = 'normal'; const append = h.pi.appendEntry; h.pi.appendEntry = () => { throw new Error('append failed'); };
  await assert.rejects(h.call('design_render', { svg: legacy }), /提交结果不确定.*产物已保留/); h.pi.appendEntry = append;
  assert.deepEqual(h.current(), initial); assert.equal((await readdir(document)).length, 2); // append outcome is not assumed reversible
  await h.call('design_render', { svg: legacy, name: '../../legacy', note: '旧接口' }); assert.equal(h.current().revision, 1);
});

test('先append再throw：引用产物保留，扩展重读分支，旧队列失效', async (t) => {
  const h = await harness(t); await h.start();
  const append = h.pi.appendEntry;
  h.pi.appendEntry = (customType, data) => { append(customType, data); throw new Error('listener failed after append'); };
  const pending = h.call('design_render', { svg: screen() });
  const queued = h.call('design_render', { svg: screen('旧队列不应提交') });
  const failures = await Promise.allSettled([pending, queued]);
  assert.equal(failures[0].status, 'rejected'); assert.match(failures[0].reason.message, /提交结果不确定/);
  assert.equal(failures[1].status, 'rejected');
  const committed = h.current(); assert.equal(committed.revision, 1);
  const artifact = committed.selected;
  const store = new DesignStore(join(h.home, '.pi/agent/designs'), exec);
  assert.equal((await store.svg(artifact)).svg, screen()); await store.png(artifact);
  const history = await h.call('design_manage', { action: 'history' });
  assert.equal(JSON.parse(history.content[0].text).revision, 1);
  h.pi.appendEntry = append;
  await h.event('session_tree');
  const next = await h.call('design_render', { updates: [{ id: 'body', content: body }] });
  assert.equal(next.details.revision, 2);
  assert.equal(h.current().history.at(-1).base.svgPath, artifact.svgPath);
  await store.svg(artifact); await store.png(artifact);
});

test('真实SessionManager：_persist抛错后内存已追加，产物保留，重新打开磁盘会话不串状态', async (t) => {
  const { SessionManager } = await import(pathToFileURL(join(sdk, 'dist/core/session-manager.js')).href);
  const h = await harness(t);
  const manager = SessionManager.create(h.home, join(h.home, 'sessions'));
  h.ctx.sessionManager = manager;
  h.pi.appendEntry = (customType, data) => h.ctx.sessionManager.appendCustomEntry(customType, data);
  await h.start();
  manager.appendMessage({ role: 'assistant', content: [], api: 'openai-completions', provider: 'test', model: 'test', stopReason: 'stop', timestamp: Date.now(), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
  const persist = manager._persist;
  manager._persist = () => { throw new Error('injected disk failure'); };
  await assert.rejects(h.call('design_render', { svg: screen() }), /提交结果不确定.*产物已保留/);
  const appended = manager.getBranch().at(-1).data;
  assert.equal(appended.revision, 1);
  const artifact = appended.selected;
  const store = new DesignStore(join(h.home, '.pi/agent/designs'), exec);
  await store.svg(artifact); await store.png(artifact);
  assert.equal(JSON.parse((await h.call('design_manage', { action: 'history' })).content[0].text).revision, 1);
  manager._persist = persist;
  const reopened = SessionManager.open(manager.getSessionFile(), join(h.home, 'sessions'));
  h.ctx.sessionManager = reopened;
  await h.event('session_start', { reason: 'resume' });
  assert.equal(JSON.parse((await h.call('design_manage', { action: 'history' })).content[0].text).revision, 0);
  const next = await h.call('design_render', { svg: screen('从已恢复会话继续') });
  assert.equal(next.details.revision, 1);
  assert.notEqual(next.details.svgPath, store.absolute(artifact.svgPath));
  await store.svg(artifact); await store.png(artifact);
  const finalSession = SessionManager.open(reopened.getSessionFile(), join(h.home, 'sessions'));
  assert.equal(finalSession.getBranch().at(-1).data.selected.svgPath, reopened.getBranch().at(-1).data.selected.svgPath);
});

test('生命周期：新brief、tree、fork、reload、空session隔离；旧文件不覆盖', async (t) => {
  const h = await harness(t); await h.start();
  const briefEntry = structuredClone(h.entries[0]);
  const r1 = await h.call('design_render', { svg: legacy, name: 'first' });
  const snapshot = structuredClone(h.entries), oldPath = r1.details.svgPath, oldContent = await readFile(oldPath);
  await h.call('design_manage', { action: 'brief', brief });
  assert.notEqual(h.current().document, snapshot.at(-1).data.document); assert.equal(h.current().revision, 0);
  await h.call('design_render', { svg: legacy, name: 'first' }); assert.deepEqual(await readFile(oldPath), oldContent);
  h.entries.splice(0, h.entries.length, briefEntry); await h.event('session_tree');
  const branch = await h.call('design_render', { svg: legacy, name: 'first' });
  assert.notEqual(branch.details.svgPath, oldPath); assert.deepEqual(await readFile(oldPath), oldContent);
  h.entries.splice(0, h.entries.length, ...structuredClone(snapshot)); h.setSession('fork-b'); await h.event('session_start', { reason: 'fork' });
  const fork = await h.call('design_render', { svg: legacy, name: 'fork' }); assert(fork.details.svgPath.includes(hash('fork-b').slice(0, 24)));
  assert.deepEqual(await readFile(oldPath), oldContent);
  const revision = h.current().revision;
  await h.event('session_shutdown', { reason: 'reload' }); h.load(); await h.event('session_start', { reason: 'reload' });
  const history = await h.call('design_manage', { action: 'history' }); assert.equal(JSON.parse(history.content[0].text).revision, revision);
  h.entries.length = 0; h.setSession('empty'); await h.event('session_start');
  await assert.rejects(h.call('design_render', { svg: legacy }), /先运行/); assert(!h.activeTools().includes('design_render')); assert(h.activeTools().includes('other_tool'));
});

test('在渲染途中tree/shutdown取消；并发串行，取消后可继续', async (t) => {
  let started, release;
  const barrier = new Promise((resolve) => started = resolve);
  const held = new Promise((resolve) => release = resolve);
  let hold = true;
  const h = await harness(t, async (command, args, options) => {
    if (command.endsWith('sips') && hold) { started(); await held; }
    return exec(command, args, options);
  });
  await h.start(); const before = structuredClone(h.current());
  const pending = h.call('design_render', { svg: legacy });
  await barrier; await h.event('session_tree'); release();
  await assert.rejects(pending); assert.deepEqual(h.current(), before);
  hold = false;
  const results = await Promise.all([h.call('design_render', { svg: legacy, name: 'one' }), h.call('design_render', { svg: legacy, name: 'two' })]);
  assert.deepEqual(results.map((r) => r.details.revision), [1, 2]);
  await h.commands.get('design-stop').handler('', h.ctx); assert.equal(h.current().active, false);
});

test('v1迁移保留revision；损坏v2失败关闭，不沿用上个会话', async (t) => {
  const h = await harness(t);
  h.entries.push({ type: 'custom', customType: 'design-mode:state', data: { version: 1, active: true, brief: '旧需求', revision: 7 } });
  await h.event('session_start');
  const result = await h.call('design_render', { svg: legacy, name: 'compat', note: '兼容' });
  assert.equal(result.details.revision, 8); assert.equal(h.current().legacyRevision, 7); assert.equal(h.current().brief.goal, '旧需求');
  assert.equal(h.current().selected.regions.length, 0);
  await assert.rejects(h.call('design_manage', { action: 'protect', regions: ['header'], status: 'locked' }), /旧无区域/);
  h.entries.push({ type: 'custom', customType: 'design-mode:state', data: { version: 2, active: true } });
  await h.event('session_start'); await assert.rejects(h.call('design_render', { svg: legacy }), /先运行/);
});

test('路径边界、符号链接、外部改稿及schema校验', async (t) => {
  const root = await directory(t), store = new DesignStore(root, exec);
  for (const path of ['/etc/passwd', '../escape', 'a/../../escape', 'a\\..\\escape']) assert.throws(() => store.absolute(path));
  const outside = await directory(t); await writeFile(join(outside, 'file.svg'), legacy); await symlink(outside, join(root, 'alias'));
  await assert.rejects(store.read('alias/file.svg', 20000), /符号链接/);
  const h = await harness(t); await h.start(); const output = await h.call('design_render', { svg: screen() });
  await writeFile(output.details.svgPath, screen('外部改稿'));
  await assert.rejects(h.call('design_render', { updates: [{ id: 'body', content: body }] }), /外部修改/);
  const bad = structuredClone(h.current()); bad.selected.svgPath = '../escape.svg'; assert.throws(() => restoreState(bad));
  assert.throws(() => parse(RenderSchema, { svg: legacy, surprise: true }));
  assert.throws(() => parse(ManageSchema, { action: 'brief', brief: { goal: '不完整' } }));
  await assert.rejects(h.call('design_manage', { action: 'history', spec: {} }));
});

test('flow/schema与方向批次失败不推进revision', async (t) => {
  const h = await harness(t); await h.start();
  for (const directions of [[], [{ id: 'a', label: 'A', svg: legacy }], Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, label: 'A', svg: legacy })), [{ id: 'a', label: 'A', svg: legacy }, { id: 'b', label: 'B', svg: legacy }]]) {
    await assert.rejects(h.call('design_render', { directions })); assert.equal(h.current().revision, 0);
  }
  await h.call('design_render', { svg: screen(), name: 'a' });
  const revision = h.current().revision;
  for (const flow of [
    { nodes: [{ id: 'x', label: 'X', artifact: 'a' }, { id: 'y', label: 'Y', artifact: 'missing' }], edges: [{ from: 'x', to: 'y', label: '下一步' }] },
    { nodes: [{ id: 'x', label: 'X', artifact: 'a' }, { id: 'y', label: 'Y', artifact: 'a' }], edges: [{ from: 'x', to: 'z', label: '下一步' }] },
  ]) { await assert.rejects(h.call('design_render', { flow })); assert.equal(h.current().revision, revision); }
});

test('flow frame：嵌入两屏实际内容；重复原始id和defs不串引用；共享真实sips', async (t) => {
  const h = await harness(t); await h.start();
  const gradient = (title, color) => screen(title).replace('<rect width="320" height="80"', `<defs><linearGradient id="paint"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#172640"/></linearGradient></defs><rect width="320" height="80"`).replace('fill="#172640"', 'fill="url(#paint)"');
  await h.call('design_render', { directions: [{ id: 'overview', label: '异常概览', svg: gradient('异常概览', '#2244aa') }, { id: 'detail', label: '处理详情', svg: gradient('处理详情', '#aa4422') }] });
  await h.call('design_manage', { action: 'select', artifact: 'overview' });
  const output = await h.call('design_render', { name: 'flow', flow: { nodes: [{ id: 'screen1', label: '异常概览', artifact: 'overview' }, { id: 'screen2', label: '处理详情', artifact: 'detail' }], edges: [{ from: 'screen1', to: 'screen2', label: '查看异常' }] } });
  const source = await readFile(output.details.svgPath, 'utf8');
  const parsed = validateSvg(source, true);
  assert(source.includes('异常概览</text>')); assert(source.includes('处理详情</text>')); assert(source.includes('确认</text>'));
  assert.equal((source.match(/<linearGradient /g) || []).length, 2);
  const references = [...source.matchAll(/fill="url\(#([^)]*)\)"/g)].map((match) => match[1]);
  assert.equal(new Set(references).size, 2);
  for (const reference of references) assert.equal(parsed.ids.get(reference).tag, 'linearGradient');
  const frames = [...parsed.ids.keys()].filter((id) => id.endsWith('-frame'));
  assert.equal(frames.length, 2);
  assert.equal(parsed.ids.size, new Set([...source.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])).size);
  assert.equal(output.content.filter((c) => c.type === 'image').length, 1);
  assert.throws(() => validateSvg(source), /嵌套 SVG/); // permissive nesting is internal flow-only
  if (process.env.DESIGN_TEST_KEEP === '1') console.log(`多屏验收 PNG：${output.details.pngPath}`);
});

test('官方 Pi loader 与真实 SessionManager 分支 API', async () => {
  const { loadExtensions } = await import(pathToFileURL(join(sdk, 'dist/core/extensions/loader.js')).href);
  const { SessionManager } = await import(pathToFileURL(join(sdk, 'dist/core/session-manager.js')).href);
  const loaded = await loadExtensions([resolve('index.ts')], resolve('.'));
  assert.deepEqual(loaded.errors, []); assert.equal(loaded.extensions.length, 1);
  const extension = loaded.extensions[0];
  assert.deepEqual([...extension.tools.keys()], ['design_render', 'design_manage']);
  assert.deepEqual([...extension.commands.keys()], ['design', 'design-stop']);
  for (const event of ['session_start', 'session_tree', 'session_shutdown']) assert(extension.handlers.has(event));
  const manager = SessionManager.inMemory(resolve('.'));
  const first = newState(brief, true), second = newState({ ...brief, goal: '第二项需求' }, true);
  const entry = manager.appendCustomEntry('design-mode:state', first);
  manager.appendCustomEntry('design-mode:state', second);
  assert.equal(restoreState(manager.getBranch().at(-1).data).document, second.document);
  manager.branch(entry);
  assert.equal(restoreState(manager.getBranch().at(-1).data).document, first.document);
  manager.resetLeaf(); assert.deepEqual(manager.getBranch(), []);
});

test('取消恰在sips完成后、shutdown途中：不推进revision', async (t) => {
  const abort = new AbortController();
  let h, stop = false;
  h = await harness(t, async (command, args, options) => {
    const result = await exec(command, args, options);
    if (command.endsWith('sips')) { if (stop) await h.event('session_shutdown'); else abort.abort(); }
    return result;
  });
  await h.start(); const initial = structuredClone(h.current());
  await assert.rejects(h.call('design_render', { svg: legacy }, abort.signal)); assert.deepEqual(h.current(), initial);
  stop = true;
  await assert.rejects(h.call('design_render', { svg: legacy })); assert.deepEqual(h.current(), initial);
});

test('根目录符号链接拒绝、根目录以上符号链接允许；v1长brief与保守diff', async (t) => {
  const root = await directory(t), outside = await directory(t);
  await symlink(outside, join(root, 'linked'));
  const store = new DesignStore(join(root, 'linked'), exec);
  await assert.rejects(store.transaction({ state: newState(brief, true), sessionId: 'test', guard() {}, commit() {}, build: async () => {} }), /符号链接/);
  assert.deepEqual(await readdir(outside), []);
  const aliasParent = await directory(t), physicalParent = await directory(t);
  await symlink(physicalParent, join(aliasParent, 'alias'));
  const throughAncestor = new DesignStore(join(aliasParent, 'alias', 'designs'), exec);
  const state = newState(brief, true);
  await throughAncestor.transaction({ state, sessionId: 'ancestor', guard() {}, commit() {}, build: async (pending) => { await writeFile(join(pending, 'proof.txt'), 'ok'); } });
  assert.equal((await readdir(join(physicalParent, 'designs'))).length, 1);
  const long = '原始需求'.repeat(400);
  assert.equal(restoreState({ version: 1, active: true, brief: long, revision: 1 }).legacyBrief, long);
  const { regionDiff } = await jiti.import('./svg.ts');
  const original = validateSvg(screen());
  const changed = validateSvg(screen().replace('viewBox="0 0 320 240"', 'viewBox="0 0 320 240" fill="#334455"'));
  assert.deepEqual(regionDiff(original, changed), { changed: ['header', 'body'], preserved: [] });
});

test('examples.json 全部真实调用顺序可运行，输出规范/评审/四revision/多屏frame', async (t) => {
  const h = await harness(t); await h.start();
  const examples = JSON.parse(await readFile(new URL('./examples.json', import.meta.url), 'utf8'));
  for (const call of examples.calls) await h.call(call.tool, call.input);
  assert.equal(h.current().revision, 4);
  assert.equal(h.current().reviews.length, 1); assert(h.current().spec);
  assert.equal(h.current().history.at(-1).kind, 'flow');
  assert(h.current().history.at(-1).flow.nodes.some((node) => node.artifact === 'detail'));
});
