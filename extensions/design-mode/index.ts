import { truncateHead, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { BriefSchema, ManageSchema, RenderSchema, parse, type DesignState, type ManageInput } from "./schema.ts";
import { DesignStore, STATE_ENTRY, artifactLinks, emptyBrief, findArtifact, newState, restoreState } from "./core.ts";
import { regionDiff } from "./svg.ts";
export { validateSvg } from "./svg.ts";
export { ManageSchema, RenderSchema } from "./schema.ts";

const tools = ["design_render", "design_manage"];
const textResult = (text: string, details: unknown = {}) => {
	const output = truncateHead(text, { maxBytes: 40_000, maxLines: 1000 });
	return { content: [{ type: "text" as const, text: output.content + (output.truncated ? "\n[已截断；完整记录见先前返回的 state.json / revision.json 路径]" : "") }], details };
};

export default function designMode(pi: ExtensionAPI): void {
	const store = new DesignStore(join(homedir(), ".pi", "agent", "designs"), pi.exec.bind(pi));
	let state = { ...newState(), active: false };
	let generation = 0;
	let lifetime = new AbortController();
	let queue: Promise<unknown> = Promise.resolve();

	function updateMode(ctx: ExtensionContext): void {
		const active = pi.getActiveTools().filter((name) => !tools.includes(name));
		pi.setActiveTools(state.active ? [...active, ...tools] : active);
		if (ctx.hasUI) ctx.ui.setStatus("design-mode", state.active ? ctx.ui.theme.fg("accent", `design r${state.revision} · ${state.selected?.id ?? "未选择"} · 保护 ${state.protection.length}`) : undefined);
	}
	function invalidate(): void { generation++; lifetime.abort(); lifetime = new AbortController(); }
	function restore(ctx: ExtensionContext): void {
		invalidate();
		state = { ...newState(), active: false };
		const latest = [...ctx.sessionManager.getBranch()].reverse().find((entry) => entry.type === "custom" && entry.customType === STATE_ENTRY);
		if (latest?.type === "custom") {
			try { state = restoreState(latest.data); }
			catch { if (ctx.hasUI) ctx.ui.notify("Design Mode 记录无效，已关闭；旧文件未修改。", "error"); }
		}
		updateMode(ctx);
	}
	function serial<T>(ctx: ExtensionContext, signal: AbortSignal | undefined, run: (guard: () => void, signal: AbortSignal) => Promise<T>): Promise<T> {
		const epoch = generation, sessionId = ctx.sessionManager.getSessionId();
		const combined = signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal;
		const guard = () => {
			combined.throwIfAborted();
			if (generation !== epoch || ctx.sessionManager.getSessionId() !== sessionId) throw new Error("会话已改变，取消旧操作");
		};
		const result = queue.then(() => { guard(); return run(guard, combined); });
		queue = result.catch(() => undefined);
		return result;
	}
	function commit(ctx: ExtensionContext, next: DesignState): void {
		try { pi.appendEntry(STATE_ENTRY, structuredClone(next)); }
		catch (error) {
			// Reconcile from the actual branch: append may have succeeded before throwing.
			try { restore(ctx); }
			catch { invalidate(); state = { ...newState(), active: false }; }
			throw error;
		}
		state = next;
		// UI errors cannot roll back a committed session pointer.
		try { updateMode(ctx); } catch { /* Session data is already committed. */ }
	}
	async function save(ctx: ExtensionContext, next: DesignState, action: string, guard: () => void, signal?: AbortSignal): Promise<string> {
		return store.transaction({ state: next, sessionId: ctx.sessionManager.getSessionId(), guard, signal, commit: (value) => commit(ctx, value), build: async (directory, relativeDirectory) => {
			await writeFile(join(directory, "action.json"), JSON.stringify({ action, at: new Date().toISOString(), revision: next.revision }, null, 2), { flag: "wx" });
			return `${relativeDirectory}/state.json`;
		} });
	}
	function active(): void { if (!state.active) throw new Error("先运行 /design 进入 Design Mode"); }

	pi.registerTool({
		name: "design_render", label: "设计渲染", executionMode: "sequential",
		description: "保存自包含静态 SVG 并内联 PNG。四选一：svg（兼容旧输入）、directions（首次 2–4 幅方向）、updates（只替换区域内部）、flow（2–4 个已存屏幕 SVG 缩放 frame、箭头与标签，无真实点击）。所有模式共享 XML 校验、sips 和原子 revision 提交。SVG <=1.5MB/4096px，PNG <=30MB，文本最多40KB/1000行。",
		parameters: RenderSchema,
		async execute(_id, raw, signal, onUpdate, ctx) {
			const input = parse(RenderSchema, raw);
			return serial(ctx, signal, async (guard, combined) => {
				active();
				onUpdate?.(textResult(`正在渲染 r${state.revision + 1}…`));
				const result = await store.render({ input, state: structuredClone(state), sessionId: ctx.sessionManager.getSessionId(), signal: combined, guard, commit: (next) => commit(ctx, next) });
				const { revision, rendered } = result;
				const output = textResult([
					`设计 r${revision.revision} · ${revision.kind}`, revision.note,
					`修改区域：${revision.changed.join(", ") || "无/非区域稿"}；保留区域：${revision.preserved.join(", ") || "无"}`,
					...rendered.map(({ artifact }) => `${artifact.id} · ${artifact.label}\n${artifactLinks(store, artifact)}`),
					`记录：${store.absolute(result.recordPath)}`,
					revision.kind === "directions" ? "请用户选择方向，再调用 design_manage select。" : "",
				].filter(Boolean).join("\n"), { revision: revision.revision, artifacts: revision.artifacts, recordPath: store.absolute(result.recordPath), changed: revision.changed, preserved: revision.preserved,
					// Preserve the v1 single-result details used by existing clients.
					svgPath: rendered[0] ? store.absolute(rendered[0].artifact.svgPath) : undefined, pngPath: rendered[0] ? store.absolute(rendered[0].artifact.pngPath) : undefined, note: input.note });
				return { ...output, content: [...output.content, ...rendered.map(({ png }) => ({ type: "image" as const, data: png.toString("base64"), mimeType: "image/png" }))] };
			});
		},
	});

	async function manage(input: ManageInput, ctx: ExtensionContext, guard: () => void, signal: AbortSignal) {
		active();
		const allowed: Record<ManageInput["action"], string[]> = { brief: ["brief"], select: ["artifact"], protect: ["regions", "status"], spec: ["spec"], review: ["review"], history: [], compare: ["revision"] };
		if (Object.keys(input).some((key) => key !== "action" && !allowed[input.action].includes(key))) throw new Error("该 action 含无关字段");
		let next = structuredClone(state);
		let summary = "";
		switch (input.action) {
			case "brief": {
				if (!input.brief) throw new Error("brief action 需要完整六字段 brief");
				next = newState(input.brief, true);
				summary = `新 brief ${next.document}\n${JSON.stringify(next.brief, null, 2)}`;
				break;
			}
			case "select": {
				if (!input.artifact) throw new Error("select 需要 artifact id");
				const artifact = findArtifact(next, input.artifact);
				if (artifact.kind !== "screen") throw new Error("flow 不是可编辑屏幕");
				if (next.protection.length && next.selected?.svgPath !== artifact.svgPath) throw new Error("先由用户解除全部保护，再切换稿件");
				await store.svg(artifact);
				next.selected = artifact;
				summary = `已选择 ${artifact.id} · ${artifact.label}\n${artifactLinks(store, artifact)}`;
				break;
			}
			case "protect": {
				if (!input.regions || !input.status || !next.selected) throw new Error("protect 需要选中稿、regions、status");
				const source = await store.svg(next.selected);
				if (input.regions.some((id) => !source.regions.some((node) => node.attrs.id === id))) throw new Error("区域不存在；旧无区域 SVG 不支持区域锁");
				if (!ctx.hasUI) throw new Error("保护变更需要用户 UI 确认；无 UI 模式不自动批准或解锁");
				const ok = await ctx.ui.confirm("确认区域保护变更", `${input.regions.join(", ")} 设置为 ${input.status}？approved 和 locked 都禁止修改。`, { signal });
				guard();
				if (!ok) throw new Error("用户取消保护变更");
				for (const id of input.regions) {
					next.protection = next.protection.filter((p) => p.id !== id);
					if (input.status !== "editable") next.protection.push({ id, status: input.status });
				}
				summary = `区域保护：${JSON.stringify(next.protection)}`;
				break;
			}
			case "spec": {
				if (!input.spec) throw new Error("spec action 需要完整 spec");
				next.spec = input.spec;
				summary = `已保存 design-spec.json（规则记录，不自动改 SVG）\n${JSON.stringify(next.spec, null, 2)}`;
				break;
			}
			case "review": {
				if (!input.review || !next.selected) throw new Error("review 需要选中稿和五维 review");
				if (new Set(input.review.items.map((item) => item.dimension)).size !== 5) throw new Error("五个评审维度必须各出现一次");
				const source = await store.svg(next.selected);
				for (const item of input.review.items) for (const evidence of item.evidence) {
					const node = evidence.region === "canvas" ? source.root : source.ids.get(evidence.region);
					if (!node || !source.svg.slice(node.start, node.end).includes(evidence.quote)) throw new Error(`证据不匹配 SVG：${item.dimension}/${evidence.region}`);
				}
				next.reviews.push({ revision: next.revision, artifact: next.selected, review: input.review });
				summary = `五维轻量评审（${input.review.author} 提供判断；仅核验证据文字存在，不是自动视觉评分）\n${JSON.stringify(input.review.items, null, 2)}`;
				break;
			}
			case "history": return textResult(JSON.stringify({ document: state.document, brief: state.brief, briefReady: state.briefReady, revision: state.revision, legacyRevision: state.legacyRevision, legacyBrief: state.legacyBrief, selected: state.selected, protection: state.protection, history: state.history, spec: state.spec, reviews: state.reviews }, null, 2));
			case "compare": {
				const revision = input.revision === undefined ? state.history.at(-1) : state.history.find((r) => r.revision === input.revision);
				if (!revision?.base) throw new Error("该 revision 没有可比较的上一版；方向初稿/flow/v1 未记录源稿不做虚假对比");
				const current = revision.artifacts[0];
				if (!current) throw new Error("当前稿不存在");
				const previous = await store.svg(revision.base), after = await store.svg(current);
				const difference = regionDiff(previous, after);
				const beforeImage = await store.png(revision.base), afterImage = await store.png(current);
				guard();
				const result = textResult(`r${revision.revision} 与其实际编辑基线对比（依次：上一版、当前版）\n修改：${difference.changed.join(", ") || "无/非区域稿"}\n保留：${difference.preserved.join(", ") || "无"}\n${artifactLinks(store, revision.base)}\n${artifactLinks(store, current)}`, { revision: revision.revision, ...difference });
				return { ...result, content: [...result.content, { type: "image" as const, data: beforeImage.toString("base64"), mimeType: "image/png" }, { type: "image" as const, data: afterImage.toString("base64"), mimeType: "image/png" }] };
			}
			default: { const exhaustive: never = input.action; throw new Error(`未知 action：${exhaustive}`); }
		}
		const record = await save(ctx, next, input.action, guard, signal);
		const path = store.absolute(record);
		return textResult(`${summary}\n[记录](${pathToFileURL(path).href})\n${path}`, { action: input.action, revision: state.revision, document: state.document, selected: state.selected, protection: state.protection, recordPath: path });
	}
	pi.registerTool({
		name: "design_manage", label: "设计记录", executionMode: "sequential",
		description: "管理真实设计状态：brief(六字段，新文档)、select(artifact id)、protect(regions/status，必须用户UI确认)、spec(颜色/字体/间距/圆角/组件规则)、review(五维，每项提供SVG区域id与原文quote)、history、compare(可选revision；内联上一版与当前版)。不自动视觉评分。文本最多40KB/1000行。",
		parameters: ManageSchema,
		async execute(_id, input, signal, _onUpdate, ctx) { return serial(ctx, signal, (guard, combined) => manage(parse(ManageSchema, input), ctx, guard, combined)); },
	});

	pi.registerCommand("design", {
		description: "开始 SVG 设计：/design <需求文本或六字段 brief JSON>；无参数打开编辑器",
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			return serial(ctx, undefined, async (guard, signal) => {
				const raw = args.trim() || (ctx.hasUI ? (await ctx.ui.editor("设计 brief：填写 user/scenario/goal/must/mustNot/direction JSON，或输入需求文本", JSON.stringify(emptyBrief("待确认"), null, 2)))?.trim() : undefined);
				guard();
				if (!raw) return;
				if (raw.length > 20_000) throw new Error("brief 过长");
				const structured = raw.startsWith("{");
				const brief = structured ? parse(BriefSchema, JSON.parse(raw)) : emptyBrief(raw.slice(0, 500));
				if (!structured && raw.length > 500) throw new Error("文本 brief 最多 500 字；请使用结构化 JSON");
				const next = newState(brief, structured);
				await save(ctx, next, "start", guard, signal);
				pi.sendUserMessage(`开始静态 SVG 设计。${structured ? "先提交2–4个方向供我选择。" : "先问清缺失字段，用 design_manage brief 保存六字段需求，再提交2–4个方向。"}\n${JSON.stringify(brief)}`);
			});
		},
	});
	pi.registerCommand("design-stop", {
		description: "停止 Design Mode，保留全部稿件和历史",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();
			await serial(ctx, undefined, async (guard, signal) => { await save(ctx, { ...structuredClone(state), active: false }, "stop", guard, signal); });
			if (ctx.hasUI) ctx.ui.notify("Design Mode 已停止；稿件保留。", "info");
		},
	});
	pi.on("before_agent_start", (event) => {
		if (!state.active) return;
		return { systemPrompt: `${event.systemPrompt}\n\n[PI DESIGN MODE ACTIVE]\n${JSON.stringify({ brief: state.brief, legacyBrief: state.legacyBrief, briefReady: state.briefReady, revision: state.revision, selected: state.selected, protection: state.protection, spec: state.spec })}\n只通过 design_render 保存静态 SVG/PNG。先补全六字段 brief；一批2–4个方向；等待用户选择。用 design_manage select 继续。区域为顶层不重叠 <svg id="header" x="0" y="0" width="1200" height="120" viewBox="0 0 1200 120" overflow="hidden">；根 viewBox 匹配尺寸。所有 id 全文唯一。禁止 CSS/style、script、foreignObject、image/use/href、外部资源、事件、声明/实体。仅基础形状/文字/内部渐变与裁剪。反馈用 updates 替换区域内部，原封不动保留其余区域。保护变更必须用户确认。禁止通过 write/edit/bash 绕过区域保护或改产物文件。设计规范是记录，不自动换主题。评审判断由你/用户提供，每维引用区域及原文证据，不声称自动评分或已做视觉验证。本机查看已保存图片仅用内置 read；不要用浏览器/Preview/终端图片工具。flow 只生成含真实已保存 SVG 缩放 frame、箭头和标签的静态多屏稿，无真实点击和 runtime。不创建网页。` };
	});
	pi.on("session_start", (_event, ctx) => restore(ctx));
	pi.on("session_tree", (_event, ctx) => restore(ctx));
	pi.on("session_shutdown", () => { invalidate(); state = { ...newState(), active: false }; });
}
