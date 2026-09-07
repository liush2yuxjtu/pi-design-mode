# Pi Design Mode usage

Pi Design Mode creates static SVG source, inline PNG previews, and JSON revision records. It does not create web pages, real interactions, browser runtimes, or a general-purpose editor.

## Commands

```text
/design <plain-text requirement>
/design <complete brief JSON>
/design
/design-stop
```

Plain text starts a document with missing fields marked for clarification. Complete JSON uses six required fields:

```json
{
  "user": "值班运营",
  "scenario": "晨会前处理异常订单",
  "goal": "先发现异常，再进入处理详情",
  "must": ["异常数量", "一个主操作"],
  "mustNot": ["外部资源", "真实点击"],
  "direction": "清晰、紧凑，重点突出"
}
```

`/design` without arguments opens a multiline editor when UI is available. `/design-stop` waits for current agent work to settle, disables design tools, and preserves artifacts.

## Tools

### `design_render`

Exactly one render mode is required:

```typescript
{
  svg?: string;
  directions?: Array<{ id: ID; label: string; svg: string }>;
  updates?: Array<{ id: ID; content: string }>;
  flow?: {
    nodes: Array<{ id: ID; label: string; artifact: ID }>;
    edges: Array<{ from: ID; to: ID; label: string }>;
  };
  name?: string;
  note?: string;
}
```

- `svg`: save one complete SVG.
- `directions`: save two to four distinct first-revision directions after a structured brief.
- `updates`: replace content inside one to 32 named top-level regions without changing protected or omitted regions.
- `flow`: compose two to four saved screens into one static connected flow. Frames use actual saved SVG content; no click behavior exists.

Successful calls return text plus PNG image content. Details include revision, artifacts, record path, changed regions, preserved regions, SVG path, PNG path, and note.

### `design_manage`

```typescript
{
  action: "brief" | "select" | "protect" | "spec" | "review" | "history" | "compare";
  brief?: Brief;
  artifact?: ID;
  regions?: ID[];
  status?: "approved" | "locked" | "editable";
  spec?: Spec;
  review?: Review;
  revision?: number;
}
```

- `brief`: create a new structured design document.
- `select`: select one saved screen direction.
- `protect`: approve, lock, or unlock named regions. Every status change requires user UI confirmation.
- `spec`: save colors, typography, spacing, radii, and component rules.
- `review`: save five evidence-linked review dimensions.
- `history`: read current brief, selection, protection, revisions, specification, and reviews.
- `compare`: show a revision and its actual edit baseline. This is region-source comparison, not pixel diff.

Only parameters belonging to selected action are accepted.

## Stable regions

Editable screens can use non-overlapping top-level SVG viewports:

```xml
<svg xmlns="http://www.w3.org/2000/svg"
     width="640" height="420" viewBox="0 0 640 420">
  <svg id="header" x="0" y="0" width="640" height="100"
       viewBox="0 0 640 100" overflow="hidden">
    <rect width="640" height="100" fill="#172640"/>
    <text x="32" y="60" font-size="28" fill="#ffffff">异常处理台</text>
  </svg>
  <svg id="body" x="0" y="100" width="640" height="320"
       viewBox="0 0 640 320" overflow="hidden">
    <rect width="640" height="320" fill="#ffffff"/>
  </svg>
</svg>
```

Rules:

- Regions are top-level nested `<svg>` viewports, not arbitrary groups.
- Up to 32 regions; no overlap or canvas overflow.
- Root and region `viewBox` values match their numeric dimensions.
- Every ID is unique across document.
- Internal gradients and clip paths stay inside region using them.
- Region updates cannot alter root attributes, root definitions, region order, region bounds, or untouched region bytes.
- Approved and locked regions cannot change until user confirms `editable`.

## Design specification

```typescript
type Spec = {
  colors: Array<{ role: string; value: `#${string}` }>;
  typography: Array<{ role: string; family: string; size: number; weight: number }>;
  spacing: number[];
  radii: number[];
  components: Array<{ name: string; rule: string }>;
};
```

Saving specification records rules. It does not restyle previous SVGs or prove compliance.

## Review

Review needs exactly these dimensions:

- Intent
- Hierarchy
- Clarity
- Consistency
- Feasibility

Each item includes finding, next action, and one to four exact source quotes tied to region ID or `canvas`. Extension verifies quoted text exists. It does not automatically judge visual quality, accessibility, or usability.

## State and artifacts

Session state uses custom entries named `design-mode:state`. Artifacts live under:

```text
~/.pi/agent/designs/
  <session hash>/
    <document UUID>/
      <transaction UUID>/
        state.json
        action.json or revision.json
        design-spec.json
        <artifact>.svg
        <artifact>.png
```

Each transaction writes to isolated pending directory, validates all output, atomically publishes directory, then appends session state. Failed validation or rendering does not advance revision. If session append result becomes uncertain, files are preserved for recovery instead of deleted.

Session start, resume, fork, reload, and tree navigation restore current branch only. New brief creates new document UUID. New branch writes new transaction UUID and never overwrites old artifacts.

## Safety limits

- macOS only in V0
- SVG dimensions: 64–4096 pixels
- SVG size: 1.5 MB
- PNG size: 30 MiB
- SVG nodes: 12,000 maximum
- SVG nesting depth: 40 maximum
- Revisions per document: 200 maximum
- Reviews per document: 200 maximum

Allowed SVG surface is restricted to basic shapes, text, groups, definitions, gradients, and clipping. Scripts, `foreignObject`, images, `use`, links, event handlers, CSS, external resources, declarations, entities, comments, processing instructions, CDATA, and namespace redefinition are rejected.

Every SVG passes restricted parser plus `/usr/bin/xmllint --nonet --noout`; PNG conversion uses `/usr/bin/sips`. Saved SVG is checked against recorded SHA-256 before reuse. Storage rejects traversal and symbolic links.

Protection prevents changes through extension tools. It is not operating-system isolation against other processes running as same user.

## Example workflow

`examples.json` contains tested call sequence:

1. Save structured brief.
2. Generate two directions.
3. Select direction.
4. Protect header after user confirmation.
5. Update body only.
6. Compare revision.
7. Save specification and five-part review.
8. Unlock after user confirmation.
9. Save detail screen.
10. Build static two-screen flow.
11. Read history.

## Development

From package root:

```bash
npm install
npm run check
npm test
```

Set `PI_SDK_ROOT` or `TSC_PATH` only when testing against non-default local SDK or compiler locations.
