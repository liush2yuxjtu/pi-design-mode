import { constants } from "node:fs";
import { lstat, mkdir, open, rename, rm, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Check } from "typebox/value";
import { ArtifactSchema, LegacySchema, StateSchema, parse, type Artifact, type Brief, type DesignState, type Flow, type RenderInput, type Revision } from "./schema.ts";
import { escapeXml, hash, regionDiff, updateRegions, validateSvg, type ParsedSvg } from "./svg.ts";

export const STATE_ENTRY = "design-mode:state";
const MAX_PNG_BYTES = 30 * 1024 * 1024;
const PNG_SIGNATURE = "89504e470d0a1a0a";
export type Exec = ExtensionAPI["exec"];
export const emptyBrief = (goal: string): Brief => ({ user: "待确认", scenario: "待确认", goal, must: [], mustNot: [], direction: "待确认" });
export function newState(brief: Brief = emptyBrief("待确认"), briefReady = false): DesignState {
	return { version: 2, active: true, document: randomUUID(), brief, briefReady, revision: 0, legacyRevision: 0, legacyBrief: null, history: [], selected: null, protection: [], spec: null, reviews: [] };
}
export function restoreState(value: unknown): DesignState {
	if (Check(LegacySchema, value)) {
		const state = newState(emptyBrief(value.brief.slice(0, 500) || "待确认"));
		state.active = value.active;
		state.revision = state.legacyRevision = value.revision;
		state.legacyBrief = value.brief;
		return state;
	}
	const state = parse(StateSchema, value);
	if (state.revision !== state.legacyRevision + state.history.length || state.history.some((r, i) => r.revision !== state.legacyRevision + i + 1)) throw new Error("会话 revision 序列无效");
	if (state.selected && !state.history.some((r) => r.artifacts.some((a) => a.svgPath === state.selected?.svgPath))) throw new Error("会话选中稿不在历史中");
	if (state.protection.some((p) => !state.selected?.regions.includes(p.id))) throw new Error("会话保护区域不存在");
	return structuredClone(state);
}

/** Every artifact is immutable. The session entry is the commit pointer; unfinished directories are never restored. */
export class DesignStore {
	constructor(readonly root: string, private readonly exec: Exec) {}

	private async directory(path: string): Promise<void> {
		const target = resolve(path);
		// Check every ancestor, not just the final path: a symlinked designs/session directory must fail closed.
		let current: string = sep;
		for (const part of target.split(sep).filter(Boolean)) {
			current = join(current, part);
			try { await mkdir(current); } catch (error) { if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error; }
			const info = await lstat(current);
			if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("产物目录不能包含符号链接");
		}
	}

	absolute(path: string): string {
		if (isAbsolute(path) || path.split(/[\\/]/).some((part) => !part || part === "." || part === "..")) throw new Error("产物路径越界");
		const target = resolve(this.root, path);
		if (!target.startsWith(resolve(this.root) + sep)) throw new Error("产物路径越界");
		return target;
	}

	async read(path: string, maxBytes: number): Promise<Buffer> {
		const absolute = this.absolute(path);
		if (await realpath(absolute) !== absolute) throw new Error("产物路径包含符号链接");
		const file = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const info = await file.stat();
			if (!info.isFile() || info.size === 0 || info.size > maxBytes) throw new Error("产物大小无效");
			return await file.readFile();
		} finally { await file.close(); }
	}

	async svg(artifact: Artifact): Promise<ParsedSvg> {
		parse(ArtifactSchema, artifact);
		const source = await this.read(artifact.svgPath, 1_500_000);
		if (hash(source) !== artifact.sha256) throw new Error("SVG 已被外部修改，拒绝使用失配版本");
		return validateSvg(source.toString("utf8"), artifact.kind === "flow");
	}

	async png(artifact: Artifact): Promise<Buffer> {
		parse(ArtifactSchema, artifact);
		const image = await this.read(artifact.pngPath, MAX_PNG_BYTES);
		if (image.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) throw new Error("转换结果不是 PNG");
		return image;
	}

	async transaction<T>(options: {
		sessionId: string; state: DesignState; signal?: AbortSignal; guard: () => void;
		build: (directory: string, relativeDirectory: string) => Promise<T>;
		commit: (state: DesignState) => void;
	}): Promise<T> {
		const { state, signal, guard } = options;
		const check = () => { signal?.throwIfAborted(); guard(); };
		check();
		const parent = this.absolute(`${hash(options.sessionId).slice(0, 24)}/${state.document}`);
		await this.directory(parent);
		const id = randomUUID();
		const pending = join(parent, `.pending-${id}`), destination = join(parent, id);
		await mkdir(pending, { mode: 0o700 });
		let published = false;
		let commitAttempted = false;
		try {
			const result = await options.build(pending, relative(this.root, destination));
			check();
			parse(StateSchema, state);
			await writeFile(join(pending, "state.json"), JSON.stringify(state, null, 2), { flag: "wx" });
			if (state.spec) await writeFile(join(pending, "design-spec.json"), JSON.stringify(state.spec, null, 2), { flag: "wx" });
			check();
			await rename(pending, destination);
			published = true;
			check();
			const snapshot = structuredClone(state);
			commitAttempted = true;
			options.commit(snapshot);
			return result;
		} catch (error) {
			// appendEntry may advance the session before persistence or an event listener throws.
			if (commitAttempted) throw new Error(`会话提交结果不确定，产物已保留：${destination}；请核对 history 与会话持久化状态。`, { cause: error });
			await rm(published ? destination : pending, { recursive: true, force: true });
			throw error;
		}
	}

	private async convert(directory: string, relativeDirectory: string, item: { id: string; label: string; svg: string; kind: "screen" | "flow" }, signal?: AbortSignal): Promise<{ artifact: Artifact; png: Buffer }> {
		const parsed = validateSvg(item.svg, item.kind === "flow");
		const svgPath = join(directory, `${item.id}.svg`), pngPath = join(directory, `${item.id}.png`);
		await writeFile(svgPath, item.svg, { flag: "wx" });
		signal?.throwIfAborted();
		const xml = await this.exec("/usr/bin/xmllint", ["--nonet", "--noout", svgPath], { signal, timeout: 10_000 });
		if (xml.code !== 0 || xml.killed) throw new Error("SVG XML 验证失败");
		signal?.throwIfAborted();
		const converted = await this.exec("/usr/bin/sips", ["-s", "format", "png", svgPath, "--out", pngPath], { signal, timeout: 30_000 });
		if (converted.code !== 0 || converted.killed) throw new Error(converted.stderr.trim().slice(-500) || "sips 渲染失败");
		signal?.throwIfAborted();
		const png = await this.read(relative(this.root, pngPath), MAX_PNG_BYTES);
		if (png.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) throw new Error("转换结果不是 PNG");
		return {
			artifact: { id: item.id, label: item.label, svgPath: `${relativeDirectory}/${item.id}.svg`, pngPath: `${relativeDirectory}/${item.id}.png`, sha256: hash(item.svg), regions: parsed.regions.map((r) => r.attrs.id ?? ""), kind: item.kind },
			png,
		};
	}

	async render(options: { input: RenderInput; state: DesignState; sessionId: string; signal?: AbortSignal; guard: () => void; commit: (state: DesignState) => void }) {
		const { input, state, signal } = options;
		if ([input.svg, input.directions, input.updates, input.flow].filter((value) => value !== undefined).length !== 1) throw new Error("只传 svg、directions、updates、flow 中一种");
		if (state.history.length >= 200) throw new Error("V0 每个 brief 最多 200 个 revision，请新建 brief");
		if (state.protection.length && (input.svg !== undefined || input.directions)) throw new Error("已有批准/锁定区域；只能局部 updates，不能全量替换或改主题");
		if (input.directions && (!state.briefReady || state.history.length)) throw new Error("方向批次需要结构化 brief，且仅在该 brief 首次渲染时提交");
		const pendingDirections = state.history.at(-1)?.kind === "directions" && !state.selected;
		if (pendingDirections) throw new Error("先用 design_manage select 选择方向");
		const base = input.flow || input.directions ? null : state.selected;
		const previous = base ? await this.svg(base) : null;
		const name = (input.name || "design").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40);
		const id = /^[A-Za-z]/.test(name) ? name : `design-${name}`;
		let kind: Revision["kind"] = "single";
		let items: { id: string; label: string; svg: string; kind: "screen" | "flow" }[];
		if (input.directions) {
			kind = "directions";
			if (new Set(input.directions.map((d) => d.id)).size !== input.directions.length) throw new Error("方向 id 不能重复");
			if (new Set(input.directions.map((d) => hash(d.svg))).size !== input.directions.length) throw new Error("方向 SVG 不能完全相同");
			items = input.directions.map((direction) => ({ ...direction, kind: "screen" }));
		} else if (input.updates) {
			kind = "update";
			if (!previous || !base) throw new Error("先选择一个有区域的稿件");
			items = [{ id: base.id, label: base.label, svg: updateRegions(previous, input.updates, state.protection.map((p) => p.id)), kind: "screen" }];
		} else if (input.flow) {
			kind = "flow";
			items = [{ id, label: "静态多屏流程", svg: await this.flow(input.flow, state), kind: "flow" }];
		} else {
			if (input.svg === undefined) throw new Error("缺少 SVG");
			items = [{ id, label: (input.name || "设计").slice(0, 80), svg: input.svg, kind: "screen" }];
		}
		// Validate entire batch before any process/file work. The whole batch commits once.
		const parsed = items.map((item) => validateSvg(item.svg, item.kind === "flow"));
		const first = parsed[0];
		if (!first) throw new Error("没有可渲染稿件");
		const diff = regionDiff(previous, first);
		if (previous?.regions.length && !input.flow && !input.directions) {
			if (previous.regions.some((r) => !first.regions.some((n) => n.attrs.id === r.attrs.id))) throw new Error("稳定区域 id 不能删除或重命名；需要新 brief");
		}
		return this.transaction({ ...options, build: async (directory, relativeDirectory) => {
			const rendered = [];
			for (const item of items) rendered.push(await this.convert(directory, relativeDirectory, item, signal));
			const revision: Revision = { revision: state.revision + 1, at: new Date().toISOString(), kind, note: input.note ?? "", artifacts: rendered.map((r) => r.artifact), base, ...diff, flow: input.flow ?? null };
			state.history.push(revision);
			state.revision = revision.revision;
			if (kind === "directions") state.selected = null;
			else if (kind !== "flow") state.selected = rendered[0]?.artifact ?? null;
			await writeFile(join(directory, "revision.json"), JSON.stringify(revision, null, 2), { flag: "wx" });
			return { revision, rendered, recordPath: `${relativeDirectory}/revision.json` };
		} });
	}

	private async flow(flow: Flow, state: DesignState): Promise<string> {
		const nodes = new Map(flow.nodes.map((node, i) => [node.id, { ...node, x: 30 + i * 310 }]));
		if (nodes.size !== flow.nodes.length) throw new Error("flow 节点 id 重复");
		for (const edge of flow.edges) if (!nodes.has(edge.from) || !nodes.has(edge.to) || edge.from === edge.to) throw new Error("flow 连线端点非法");
		if (flow.nodes.some((node) => !flow.edges.some((e) => e.from === node.id || e.to === node.id))) throw new Error("flow 存在未连接节点");
		const visited = new Set<string>();
		const visit = (id: string) => { if (visited.has(id)) return; visited.add(id); for (const e of flow.edges) { if (e.from === id) visit(e.to); if (e.to === id) visit(e.from); } };
		const first = flow.nodes[0];
		if (first) visit(first.id);
		if (visited.size !== nodes.size) throw new Error("flow 必须连通");
		const cards: string[] = [];
		for (const node of nodes.values()) {
			const artifact = findArtifact(state, node.artifact);
			if (artifact.kind !== "screen") throw new Error("flow 节点必须引用屏幕稿");
			const source = await this.svg(artifact);
			cards.push(`<g id="${node.id}"><rect x="${node.x}" y="70" width="270" height="280" rx="12" fill="#ffffff" stroke="#425879"/><text x="${node.x + 12}" y="98" font-size="18">${escapeXml(node.label)}</text>${screenFrame(source, node.id, node.x + 10, 112)}<text x="${node.x + 12}" y="333" font-size="12">${escapeXml(artifact.label)} · ${escapeXml(artifact.id)}</text></g>`);
		}
		const lines = flow.edges.map((edge, i) => {
			const from = nodes.get(edge.from), to = nodes.get(edge.to);
			if (!from || !to) throw new Error("flow 端点不存在");
			const x1 = from.x + 135, x2 = to.x + 135, y = 390 + i * 38;
			const head = `${x2 - 5},358 ${x2},350 ${x2 + 5},358`;
			return `<path d="M ${x1} 350 V ${y} H ${x2} V 350" stroke="#425879" fill="none"/><polyline points="${head}" fill="none" stroke="#425879"/><text x="${Math.min(x1, x2) + 10}" y="${y - 8}" font-size="13">${escapeXml(`${edge.from} / ${edge.label} / ${edge.to}`)}</text>`;
		});
		return `<svg xmlns="http://www.w3.org/2000/svg" width="${nodes.size * 310}" height="${430 + flow.edges.length * 38}" viewBox="0 0 ${nodes.size * 310} ${430 + flow.edges.length * 38}" font-family="Arial" fill="#18263c"><rect width="${nodes.size * 310}" height="${430 + flow.edges.length * 38}" fill="#ffffff"/><text x="30" y="36" font-size="18">静态多屏流程 · 已保存 SVG 缩放 frame · 无真实点击</text>${cards.join("")}${lines.join("")}</svg>`;
	}
}

/** Embed validated source, not a second renderer. Prefix every ID/reference per frame before shared validation/sips. */
function screenFrame(source: ParsedSvg, frame: string, x: number, y: number): string {
	const prefix = `f${hash(frame).slice(0, 12)}-`;
	const ids = new Map([...source.ids.keys()].map((id) => [id, `${prefix}${hash(id).slice(0, 12)}`]));
	const nodes = [source.root];
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (node) nodes.push(...node.children);
	}
	let result = source.svg;
	for (const node of nodes.sort((a, b) => b.start - a.start)) {
		const attrs = { ...node.attrs };
		delete attrs.xmlns;
		if (attrs.id) attrs.id = ids.get(attrs.id) ?? attrs.id;
		for (const [key, value] of Object.entries(attrs)) {
			const reference = /^url\(#(.+)\)$/.exec(value)?.[1];
			if (reference) {
				const target = ids.get(reference);
				if (!target) throw new Error("flow frame 引用不存在");
				attrs[key] = `url(#${target})`;
			}
		}
		const selfClosing = /\/\s*>$/.test(source.svg.slice(node.start, node.innerStart));
		const opening = `<${node.tag} ${Object.entries(attrs).map(([key, value]) => {
			const quote = value.includes('"') ? "'" : '"';
			return `${key}=${quote}${value}${quote}`;
		}).join(" ")}${selfClosing ? "/" : ""}>`;
		result = result.slice(0, node.start) + opening + result.slice(node.innerStart);
	}
	return `<svg id="${prefix}frame" x="${x}" y="${y}" width="250" height="200" viewBox="0 0 ${source.root.attrs.width} ${source.root.attrs.height}" overflow="hidden" preserveAspectRatio="xMidYMid meet" fill="#000000" font-family="serif">${result.trim()}</svg>`;
}

export function findArtifact(state: DesignState, id: string): Artifact {
	for (const revision of [...state.history].reverse()) {
		const artifact = revision.artifacts.find((candidate) => candidate.id === id);
		if (artifact) return artifact;
	}
	throw new Error(`稿件不存在：${id}`);
}
export function artifactLinks(store: DesignStore, artifact: Artifact): string {
	return ["svgPath", "pngPath"].map((key) => {
		const path = store.absolute(key === "svgPath" ? artifact.svgPath : artifact.pngPath);
		return `[${key === "svgPath" ? "SVG" : "PNG"}](${pathToFileURL(path).href})\n${path}`;
	}).join("\n");
}
