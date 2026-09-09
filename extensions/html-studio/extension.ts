import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { withFileMutationQueue } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { StringEnum } from '@earendil-works/pi-ai';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStudio } from './server.mjs';

const ENTRY = 'design-studio:project';
export default function designStudio(pi: ExtensionAPI) {
 let app: Awaited<ReturnType<typeof startStudio>> | undefined;
 let context: ExtensionContext | undefined;
 let opening: Promise<void> | undefined;
 let epoch = 0;
 const rootFor = (ctx: ExtensionContext) => join(resolve(ctx.cwd) === homedir() ? join(homedir(), 'projects', 'pi-design-workspace') : ctx.cwd, '.pi-design');
 function instruction(task: string, text: string, root: string) {
  const skills = task === 'reference' ? ['pi-design-reference'] : task === 'system' ? ['anthropic-design-system'] : task === 'frontend' ? ['product-demo', 'frontend-design'] : ['claude-design'];
  return `[用户从 /design 控制面板发起的请求]\n任务：${task}\n项目：${root}\n用户内容：${text}\n先读取随包说明 ${fileURLToPath(new URL('./WORKFLOW.md', import.meta.url))}。可选技能：${skills.join(', ')}，仅在当前环境确实可用时读取；未安装时按随包说明执行，不虚构技能或 slash 工具。\n设计数值唯一真源：${root}/design-system/tokens.css；组件设计唯一真源：${root}/design-system/components.html。先用 design_workspace inspect 取得 etag。支持的数值、标题、布局和说明修改用 design_workspace apply，不能绕过锁定。超出工具编辑契约时先解释缺失能力，不直接覆盖受管文件。参考阶段用当前可用的搜索工具核验四类具体参考；没有搜索能力时说明限制，不冒充已搜索。前端任务按随包 WORKFLOW.md，在独立目录真正完成模板工程、构建和视觉对照，不自动部署。不能声称仅导出 HTML 就完成框架构建。`;
 }
 async function open(ctx: ExtensionContext) {
  if (app) return;
  if (opening) return opening;
  if (!ctx.isProjectTrusted()) throw new Error('先信任项目，再启用设计文件写入');
  const currentEpoch = epoch;
  opening = (async () => {
   const root = rootFor(ctx);
   const created = await startStudio({ root, sessionId: ctx.sessionManager.getSessionId(),
    mutate: (task: () => unknown) => withFileMutationQueue(join(root, 'design-system', 'tokens.css'), () => withFileMutationQueue(join(root, 'design-system', 'components.html'), async () => task())),
    onPrompt: async (task: string, text: string) => {
     if (currentEpoch !== epoch || !context) throw new Error('Pi 会话已改变，请重新打开工作区');
     pi.sendUserMessage(instruction(task, text, root), { deliverAs: 'followUp' });
    },
    onCommit: (revision: number) => {
     if (currentEpoch !== epoch) return;
     pi.appendEntry(ENTRY, { root, revision });
     if (context?.hasUI) context.ui.setStatus('design-studio', `/design · v${revision} · 文件已保存`);
    }
   });
   if (currentEpoch !== epoch) { await created.close(); throw new Error('会话改变，设计服务已关闭'); }
   app = created;
   pi.appendEntry(ENTRY, { root, revision: created.store.read().revision });
  })();
  try { await opening; } finally { opening = undefined; }
 }
 async function close() { epoch++; const old = app; app = undefined; if (old) await old.close(); }
 pi.registerCommand('design', {
  description: '打开真实 HTML 设计工作区；/design reference|system|frontend <需求> 交给当前 Pi',
  handler: async (args, ctx) => {
   context = ctx; await open(ctx); if (!app) throw new Error('设计服务未启动');
   pi.sendMessage({ customType: 'design-studio', content: `设计工作区已启动：[打开控制面板](${app.url})\n项目：${app.store.root}\n只有你点击“应用到项目”才写回草稿。不会自动打开浏览器。`, display: true });
   if (ctx.hasUI) ctx.ui.setWidget('design-studio', ['Pi /design · 真实文件工作区', app.store.root, '参考 / 系统 / 画布 / Tokens / 前端']);
   const raw = args.trim(); if (raw) { const match = /^(reference|system|frontend|edit)\s*(.*)$/s.exec(raw); pi.sendUserMessage(instruction(match?.[1] || 'edit', match?.[2] || raw, app.store.root), { deliverAs: 'followUp' }); }
  }
 });
 pi.registerCommand('design-stop', { description: '关闭设计服务，保留所有真源与版本', handler: async (_args, ctx) => { await close(); if (ctx.hasUI) {ctx.ui.setWidget('design-studio', undefined);ctx.ui.setStatus('design-studio', undefined);} } });
 pi.registerTool({ name: 'design_workspace', label: '设计工作区', description: '打开或读取真实 HTML 设计工作区；先调用 {action:"inspect"}，再将结果 etag 原样放入 apply 的 base 参数，防冲突写入受支持的 token、标题、布局、说明、参考。不能解除锁。完整输出保留在项目文件，工具文本限 20KB。',
  parameters: Type.Object({ action: StringEnum(['open', 'inspect', 'apply']), base: Type.Optional(Type.String({ description: 'apply 必填：逐字复制上一次 inspect 返回的 etag，64 位小写十六进制哈希。不是目录、路径或版本号。inspect/open 不传 base。', pattern: '^[a-f0-9]{64}$' })), patch: Type.Optional(Type.Object({ accent: Type.Optional(Type.String()), radius: Type.Optional(Type.Integer()), space: Type.Optional(Type.Integer()), headline: Type.Optional(Type.String()), variant: Type.Optional(StringEnum(['grid','list'])), theme: Type.Optional(StringEnum(['light','dark'])), design: Type.Optional(Type.String()), references: Type.Optional(Type.Array(Type.Object({ category: StringEnum(['design','system','screen','flow','template']), title: Type.String(), url: Type.String(), status: Type.String() }, { additionalProperties: false }))) }, { additionalProperties: false })) }, { additionalProperties: false }),
  renderCall(args) {
   return { render: () => [`design_workspace · ${args.action || '准备中'}`], invalidate() {} };
  },
  renderResult(result, _options, _theme, context) {
   const revision = result.details && typeof result.details === 'object' && 'revision' in result.details && typeof result.details.revision === 'number' ? result.details.revision : undefined;
   return { render: () => [context.isError ? '设计工作区操作失败，未确认写入。' : revision === undefined ? '设计工作区处理中' : `磁盘 v${revision} · 设计工作区已读取`, '授权链接保留在 /design 控制面板入口，不在工具摘要中展开。'], invalidate() {} };
  },
  async execute(_id, params, signal, _update, ctx) {
   signal?.throwIfAborted(); context = ctx; await open(ctx); if (!app) throw new Error('设计服务未启动');
   const current = app;
   if (params.action === 'apply') {
    if (!params.base || !params.patch) throw new Error('apply 需要 base etag 和 patch');
    await withFileMutationQueue(join(current.store.system, 'tokens.css'), () => withFileMutationQueue(join(current.store.system, 'components.html'), async () => { signal?.throwIfAborted(); const result = current.store.apply(params.base, params.patch, 'Pi 工具更新'); pi.appendEntry(ENTRY, { root: current.store.root, revision: result.revision }); }));
   }
   const state = current.store.read();
   const text = JSON.stringify({ url: current.url, root: state.root, revision: state.revision, etag: state.etag, state: state.state, references: state.references, history: state.history }, null, 2);
   return { content: [{ type: 'text', text: text.slice(0,20000) }], details: { root: state.root, revision: state.revision } };
  }
 });
 pi.on('session_start', async (_event, ctx) => { await close(); context = ctx; });
 pi.on('session_tree', async (_event, ctx) => { await close(); context = ctx; if (ctx.hasUI) ctx.ui.notify('设计服务已关闭；项目历史独立保留。/design 重新打开当前磁盘版本。', 'info'); });
 pi.on('session_shutdown', async () => { context = undefined; await close(); });
 pi.on('before_agent_start', () => app ? { message: { customType: 'design-studio-context', content: `当前设计工作区 ${app.store.root}。tokens.css 与 components.html 是两个真源；用 design_workspace inspect/apply 进行支持范围内的修改。不要绕过锁或直接覆盖真源。参考、系统和前端生成分别按已安装技能执行。浏览器样例数据不代表真实业务数据。`, display: false } } : undefined);
 pi.on('agent_start', () => app?.store.emit('Pi 开始处理请求'));
 pi.on('agent_settled', () => app?.store.emit('Pi 本轮处理结束','请核对实际修改，不将事件本身当作验收成功'));
}
