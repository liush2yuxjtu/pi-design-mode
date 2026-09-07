import { Type, type Static, type TSchema } from "typebox";
import { Check } from "typebox/value";
import { StringEnum } from "@earendil-works/pi-ai";

const object = <T extends Record<string, TSchema>>(properties: T) => Type.Object(properties, { additionalProperties: false });
const text = (maxLength = 500) => Type.String({ minLength: 1, maxLength, pattern: "[^\\s]" });
export const Id = Type.String({ pattern: "^[a-zA-Z][a-zA-Z0-9_-]{0,47}$" });
const strings = (maxItems = 24) => Type.Array(text(), { maxItems });
export const BriefSchema = object({ user: text(), scenario: text(), goal: text(), must: strings(), mustNot: strings(), direction: text() });
export type Brief = Static<typeof BriefSchema>;
export const SpecSchema = object({
	colors: Type.Array(object({ role: text(80), value: Type.String({ pattern: "^#[0-9a-fA-F]{6}$" }) }), { minItems: 1, maxItems: 24 }),
	typography: Type.Array(object({ role: text(80), family: text(120), size: Type.Number({ minimum: 8, maximum: 120 }), weight: Type.Integer({ minimum: 100, maximum: 900 }) }), { minItems: 1, maxItems: 12 }),
	spacing: Type.Array(Type.Number({ minimum: 0, maximum: 256 }), { minItems: 1, maxItems: 16 }),
	radii: Type.Array(Type.Number({ minimum: 0, maximum: 256 }), { minItems: 1, maxItems: 16 }),
	components: Type.Array(object({ name: text(80), rule: text() }), { minItems: 1, maxItems: 24 }),
});
export type Spec = Static<typeof SpecSchema>;
export const ReviewSchema = object({
	author: StringEnum(["assistant", "user"] as const),
	items: Type.Array(object({
		dimension: StringEnum(["Intent", "Hierarchy", "Clarity", "Consistency", "Feasibility"] as const),
		finding: text(), evidence: Type.Array(object({ region: Id, quote: text(240) }), { minItems: 1, maxItems: 4 }),
		next: text(),
	}), { minItems: 5, maxItems: 5 }),
});
const svg = Type.String({ minLength: 1, maxLength: 1_500_000 });
export const FlowSchema = object({
	nodes: Type.Array(object({ id: Id, label: text(48), artifact: Id }), { minItems: 2, maxItems: 4 }),
	edges: Type.Array(object({ from: Id, to: Id, label: text(48) }), { minItems: 1, maxItems: 8 }),
});
export type Flow = Static<typeof FlowSchema>;
// Top-level object stays provider-compatible; execute enforces exactly one render mode.
export const RenderSchema = object({
	svg: Type.Optional(svg), name: Type.Optional(Type.String({ maxLength: 80 })), note: Type.Optional(Type.String({ maxLength: 240 })),
	directions: Type.Optional(Type.Array(object({ id: Id, label: text(80), svg }), { minItems: 2, maxItems: 4 })),
	updates: Type.Optional(Type.Array(object({ id: Id, content: svg }), { minItems: 1, maxItems: 32 })),
	flow: Type.Optional(FlowSchema),
});
export type RenderInput = Static<typeof RenderSchema>;
export const ManageSchema = object({
	action: StringEnum(["brief", "select", "protect", "spec", "review", "history", "compare"] as const),
	brief: Type.Optional(BriefSchema), artifact: Type.Optional(Id),
	regions: Type.Optional(Type.Array(Id, { minItems: 1, maxItems: 32, uniqueItems: true })),
	status: Type.Optional(StringEnum(["approved", "locked", "editable"] as const)),
	spec: Type.Optional(SpecSchema), review: Type.Optional(ReviewSchema),
	revision: Type.Optional(Type.Integer({ minimum: 1 })),
});
export type ManageInput = Static<typeof ManageSchema>;
const path = Type.String({ pattern: "^[a-f0-9]{24}/[a-f0-9-]{36}/[a-f0-9-]{36}/[a-zA-Z0-9_-]+\\.(svg|png|json)$" });
const hash = Type.String({ pattern: "^[a-f0-9]{64}$" });
export const ArtifactSchema = object({ id: Id, label: text(80), svgPath: path, pngPath: path, sha256: hash, regions: Type.Array(Id, { maxItems: 32 }), kind: StringEnum(["screen", "flow"] as const) });
export type Artifact = Static<typeof ArtifactSchema>;
const revision = object({
	revision: Type.Integer({ minimum: 1 }), at: text(40), kind: StringEnum(["single", "directions", "update", "flow"] as const),
	note: Type.String({ maxLength: 240 }), artifacts: Type.Array(ArtifactSchema, { minItems: 1, maxItems: 4 }),
	base: Type.Union([ArtifactSchema, Type.Null()]), changed: Type.Array(Id, { maxItems: 32 }), preserved: Type.Array(Id, { maxItems: 32 }),
	flow: Type.Union([FlowSchema, Type.Null()]),
});
export type Revision = Static<typeof revision>;
export const StateSchema = object({
	version: Type.Literal(2), active: Type.Boolean(), document: Type.String({ pattern: "^[a-f0-9-]{36}$" }),
	brief: BriefSchema, briefReady: Type.Boolean(), revision: Type.Integer({ minimum: 0 }),
	legacyRevision: Type.Integer({ minimum: 0 }), legacyBrief: Type.Union([Type.String(), Type.Null()]),
	history: Type.Array(revision, { maxItems: 200 }),
	selected: Type.Union([ArtifactSchema, Type.Null()]),
	protection: Type.Array(object({ id: Id, status: StringEnum(["approved", "locked"] as const) }), { maxItems: 32 }),
	spec: Type.Union([SpecSchema, Type.Null()]),
	reviews: Type.Array(object({ revision: Type.Integer({ minimum: 1 }), artifact: ArtifactSchema, review: ReviewSchema }), { maxItems: 200 }),
});
export type DesignState = Static<typeof StateSchema>;
export function parse<T extends TSchema>(schema: T, value: unknown): Static<T> {
	if (!Check(schema, value)) throw new Error("输入或会话记录不符合 schema");
	return value;
}
export const LegacySchema = object({ version: Type.Literal(1), active: Type.Boolean(), brief: Type.String(), revision: Type.Integer({ minimum: 0, maximum: 1_000_000 }) });
