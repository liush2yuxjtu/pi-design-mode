import { createHash } from "node:crypto";

export const MAX_SVG_BYTES = 1_500_000;
const elements = new Set("svg g defs rect circle ellipse line polyline polygon path text tspan title desc linearGradient radialGradient stop clipPath".split(" "));
const attributes = new Set("xmlns id width height viewBox x y x1 y1 x2 y2 cx cy r rx ry d points fill stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset fill-rule clip-rule opacity fill-opacity stroke-opacity transform font-family font-size font-weight font-style text-anchor dominant-baseline letter-spacing dx dy gradientUnits gradientTransform offset stop-color stop-opacity clip-path clipPathUnits overflow preserveAspectRatio".split(" "));
export const hash = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
export interface SvgNode { tag: string; attrs: Record<string, string>; start: number; innerStart: number; innerEnd: number; end: number; children: SvgNode[]; scope: string; }
export interface ParsedSvg { svg: string; root: SvgNode; regions: SvgNode[]; ids: Map<string, SvgNode>; }
const identifier = /^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/;
function number(value: string | undefined): number {
	if (!value || !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) throw new Error("SVG 视口需要非负数字");
	const result = Number(value);
	if (!Number.isFinite(result) || result > 4096) throw new Error("SVG 视口超出 4096");
	return result;
}

/** Deliberately restricted SVG grammar, followed by native XML validation before sips. No CSS or resource-loading elements. */
export function validateSvg(svg: string, generatedFlow = false): ParsedSvg {
	if (typeof svg !== "string" || Buffer.byteLength(svg) > MAX_SVG_BYTES) throw new Error("SVG 超过 1.5 MB");
	if (Buffer.from(svg).toString() !== svg || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(svg)) throw new Error("SVG 非法字符");
	if (/<!|\?>/.test(svg)) throw new Error("SVG 不允许声明、实体、注释或处理指令");
	const stack: SvgNode[] = [];
	const ids = new Map<string, SvgNode>();
	const references: { id: string; node: SvgNode; attribute: string }[] = [];
	let root: SvgNode | undefined;
	let position = 0;
	let count = 0;
	while (position < svg.length) {
		if (svg[position] !== "<") {
			const end = svg.indexOf("<", position);
			const text = svg.slice(position, end < 0 ? svg.length : end);
			if (/&(?!(?:amp|lt|gt|quot|apos);)/.test(text) || text.includes("]]>")) throw new Error("SVG 不允许自定义或数字实体");
			const parent = stack.at(-1);
			if (text.trim() && (!parent || !["text", "tspan", "title", "desc"].includes(parent.tag))) throw new Error("SVG 文本位置非法");
			position += text.length;
			continue;
		}
		const close = /^<\/([A-Za-z][A-Za-z0-9]*)\s*>/.exec(svg.slice(position));
		if (close) {
			const node = stack.pop();
			if (!node || node.tag !== close[1]) throw new Error("SVG 标签未正确闭合");
			node.innerEnd = position;
			node.end = position + close[0].length;
			position = node.end;
			continue;
		}
		const open = /^<([A-Za-z][A-Za-z0-9]*)\b/.exec(svg.slice(position));
		if (!open || !elements.has(open[1] ?? "")) throw new Error("SVG 含不支持或不安全元素");
		const tag = open[1];
		if (!tag) throw new Error("SVG 缺少标签");
		const attrs: Record<string, string> = Object.create(null);
		let cursor = position + open[0].length;
		while (!/^\s*\/?>/.test(svg.slice(cursor))) {
			const match = /^\s+([A-Za-z][A-Za-z0-9-]*)\s*=\s*(["'])([^<>]*?)\2/.exec(svg.slice(cursor));
			if (!match) throw new Error("SVG 属性语法非法");
			const [, key, , value] = match;
			if (!key || value === undefined || !attributes.has(key) || Object.hasOwn(attrs, key) || /[&\\\r\n]/.test(value)) throw new Error("SVG 属性不支持（禁止 CSS、事件、外部资源、实体）");
			if (/url\s*\(/i.test(value) && (!/^(fill|stroke|clip-path)$/.test(key) || !/^url\(#[a-zA-Z][a-zA-Z0-9_-]{0,47}\)$/.test(value))) throw new Error("SVG 仅允许内部 url(#id)");
			if (/(?:https?:|file:|data:|javascript:|@import)/i.test(value) && key !== "xmlns") throw new Error("SVG 不允许外部资源");
			attrs[key] = value;
			cursor += match[0].length;
		}
		const ending = /^\s*(\/?)>/.exec(svg.slice(cursor));
		if (!ending) throw new Error("SVG 开始标签非法");
		cursor += ending[0].length;
		const parent = stack.at(-1);
		if (++count > 12_000 || stack.length > 40) throw new Error("SVG 过于复杂");
		if (!parent && (root || tag !== "svg")) throw new Error("SVG 必须只有一个 svg 根元素");
		if (parent && attrs.xmlns !== undefined) throw new Error("SVG 禁止命名空间重定义");
		if (tag === "svg" && parent && parent !== root && !generatedFlow) throw new Error("区域内不允许嵌套 SVG");
		const scope = parent === root && tag === "svg" ? (attrs.id ?? "") : (parent?.scope ?? "");
		const node: SvgNode = { tag, attrs, start: position, innerStart: cursor, innerEnd: cursor, end: cursor, children: [], scope };
		if (attrs.id !== undefined) {
			if (!identifier.test(attrs.id) || ids.has(attrs.id)) throw new Error("SVG id 非法或重复");
			ids.set(attrs.id, node);
		}
		for (const [attribute, value] of Object.entries(attrs)) {
			const ref = /^url\(#(.+)\)$/.exec(value)?.[1];
			if (ref) {
				if (stack.some((ancestor) => ancestor.tag === "clipPath") || tag === "clipPath") throw new Error("禁止递归裁剪引用");
				references.push({ id: ref, node, attribute });
			}
		}
		if (parent) parent.children.push(node); else root = node;
		if (!ending[1]) stack.push(node);
		position = cursor;
	}
	if (!root || stack.length) throw new Error("SVG 不完整");
	if (root.attrs.xmlns !== "http://www.w3.org/2000/svg") throw new Error("SVG 根元素必须使用 SVG xmlns");
	const width = number(root.attrs.width), height = number(root.attrs.height);
	if (width < 64 || height < 64) throw new Error("SVG 至少 64×64，最大 4096×4096");
	// Only the internal flow composer may nest previously validated screens. Flow is not region-editable.
	const regions = generatedFlow ? [] : root.children.filter((node) => node.tag === "svg");
	if (regions.length > 32) throw new Error("最多 32 个区域");
	if (regions.length) {
		if (root.attrs.viewBox !== `0 0 ${width} ${height}`) throw new Error("区域化 SVG 的根 viewBox 必须匹配尺寸");
		if (root.children.some((node) => !["svg", "defs", "title", "desc"].includes(node.tag))) throw new Error("区域化 SVG 仅允许顶层视口区域、defs、title、desc");
		const boxes = regions.map((node) => {
			if (!node.attrs.id || node.attrs.overflow !== "hidden") throw new Error("区域必须提供稳定 id 与 overflow=hidden");
			if (Object.keys(node.attrs).some((key) => !["id", "x", "y", "width", "height", "viewBox", "overflow"].includes(key))) throw new Error("区域视口不允许 transform 或全局样式");
			const x = number(node.attrs.x), y = number(node.attrs.y), w = number(node.attrs.width), h = number(node.attrs.height);
			if (!w || !h || x + w > width || y + h > height || node.attrs.viewBox !== `0 0 ${w} ${h}`) throw new Error("区域边界或 viewBox 非法");
			return { x, y, w, h };
		});
		for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) {
			if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) throw new Error("区域不能重叠");
		}
	}
	for (const ref of references) {
		const target = ids.get(ref.id);
		if (!target || target.scope !== ref.node.scope) throw new Error("引用不存在或跨区域");
		if (ref.attribute === "clip-path" ? target.tag !== "clipPath" : !["linearGradient", "radialGradient"].includes(target.tag)) throw new Error("SVG 引用类型非法");
	}
	return { svg, root, regions, ids };
}

export function updateRegions(previous: ParsedSvg, updates: { id: string; content: string }[], protectedIds: string[]): string {
	if (!previous.regions.length) throw new Error("旧 SVG 没有区域；先在无保护状态下完整区域化");
	if (new Set(updates.map((update) => update.id)).size !== updates.length) throw new Error("区域更新重复");
	let result = previous.svg;
	const replacements = updates.map((update) => {
		const region = previous.regions.find((node) => node.attrs.id === update.id);
		if (!region) throw new Error(`区域不存在：${update.id}`);
		if (protectedIds.includes(update.id)) throw new Error(`区域 ${update.id} 已批准或锁定；先由用户明确解除保护`);
		return { region, content: update.content };
	}).sort((a, b) => b.region.innerStart - a.region.innerStart);
	for (const { region, content } of replacements) result = result.slice(0, region.innerStart) + content + result.slice(region.innerEnd);
	const next = validateSvg(result);
	if (regionFrame(previous) !== regionFrame(next)) throw new Error("局部更新不能改根、defs、区域顺序或边界");
	for (const region of previous.regions) {
		const id = region.attrs.id;
		if (!id || updates.some((update) => update.id === id)) continue;
		const after = next.ids.get(id);
		if (!after || previous.svg.slice(region.start, region.end) !== result.slice(after.start, after.end)) throw new Error("局部更新改变了保留区域");
	}
	return result;
}
function regionFrame(parsed: ParsedSvg): string {
	let source = parsed.svg;
	for (const node of [...parsed.regions].reverse()) source = source.slice(0, node.innerStart) + "[region]" + source.slice(node.innerEnd);
	return source;
}
export function regionDiff(previous: ParsedSvg | null, next: ParsedSvg): { changed: string[]; preserved: string[] } {
	const changed: string[] = [], preserved: string[] = [];
	const sameFrame = previous !== null && regionFrame(previous) === regionFrame(next);
	for (const id of new Set([...(previous?.regions ?? []).map((r) => r.attrs.id), ...next.regions.map((r) => r.attrs.id)])) {
		if (!id) continue;
		const before = previous?.ids.get(id), after = next.ids.get(id);
		if (sameFrame && before && after && previous?.svg.slice(before.start, before.end) === next.svg.slice(after.start, after.end)) preserved.push(id); else changed.push(id);
	}
	return { changed, preserved };
}
export const escapeXml = (text: string): string => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
