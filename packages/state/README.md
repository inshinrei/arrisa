# @arrisa/state

**Immutable editor state, selection, and transactions on top of `@arrisa/doc`.**

`EditorState` holds a document, selection, and configuration (fields/facets). Updates go through pure `Transaction` specs (`ChangeSet` + selection + effects + annotations). Also includes textblock maps, bidirectional spans, structural corrections, and HTML-string helpers for browser doc loading.

## Install

```bash
pnpm add @arrisa/state
```

Peer/runtime dependency: `@arrisa/doc`.

## Quick start

```ts
import {Schema, Plot, Leaf, Slice} from "@arrisa/doc"
import {EditorState, EditorSelection} from "@arrisa/state"

let paragraph = Plot.define("paragraph", {
    inlineContent: true,
    shape: {element: "p"},
})
let docType = Plot.defineDoc({blockContent: paragraph})
let schema = Schema.define([docType, paragraph])

let doc = schema.doc([paragraph.create([Leaf.text("hello")])])

let state = EditorState.create({
    doc,
    selection: {anchor: 1, head: 1},
    config: [EditorState.schemaElement.of(schema.elements)],
})

// Pure update → Transaction; new state via tr.state
let tr = state.update({
    changes: {from: 6, to: 6, insert: Slice.of([Leaf.text("!")])},
    selection: EditorSelection.cursor(7),
    userEvent: "input.type",
})
let next = tr.state
```

## Features / concepts

| Concept | Role |
|---------|------|
| **EditorState** | Immutable snapshot: `doc`, `selection`, config slots (fields/facets). |
| **Transaction** | Resolved change + selection + effects/annotations; lazy `tr.state`. |
| **EditorSelection** | Text ranges, node selection, resolve/map against the doc. |
| **Field / Facet** | Extension storage: state fields update per transaction; facets combine providers. |
| **Compartment / reconfigure** | Swap or rebuild configuration without losing the document. |
| **TextblockMap / BidiSpan** | Project a textblock to a string for bidi and visual cursor motion. |
| **Correction** | Transaction extenders that auto-fix structure after local edits. |
| **findClusterBreak** | Approximate grapheme-cluster boundaries for cursor motion. |

## Main public API

Root exports:

```ts
import {
    EditorState,
    Transaction,
    EditorSelection,
    TextblockMap,
    BidiSpan,
    Correction,
    findClusterBreak,
    htmlStringToElement,
    toAssignableHTML,
    wrapMap,
    readDoc,
    type HtmlFromStringOptions,
    type TrustedHTMLPolicy,
    type DocSource,
    type ReadDocOptions,
} from "@arrisa/state"
```

Nested APIs live on namespaces (not separate top-level exports):

- `EditorState.Field`, `EditorState.Facet`, `EditorState.Compartment`, `EditorState.Configuration`
- `EditorState.schemaElement`, `EditorState.readOnly`, `EditorState.prec`, …
- `Transaction.Effect`, `Transaction.Annotation`, `Transaction.userEvent`, `Transaction.remote`, …
- `EditorSelection.cursor`, `EditorSelection.range`, `EditorSelection.Text`, `EditorSelection.Node`

### EditorState

| API | Description |
|-----|-------------|
| `EditorState.create(spec)` | Build from `doc` (`DocSource`), optional `selection`, `config`, optional `sanitizeHTML` / `trustedHTMLPolicy`. |
| `state.update(spec)` | Resolve a `Transaction.Spec` (does not apply until `tr.state`). |
| `state.field` / `state.facet` | Read extension values. |
| `state.sel` | Selection resolved against current doc (cached). |
| `EditorState.fromJSON` / `state.toJSON` | Serialize doc + selection (+ optional fields). |
| `EditorState.reconfigure` / `appendConfig` | Effects that rebuild configuration. |
| `EditorState.schemaElement.of(elements)` | Provide schema elements (config resolves a `Schema`). |

`DocSource` may be a `Plot.Doc`, JSON, HTML string/element, or `(schema) => doc`.

### Transaction

| API | Description |
|-----|-------------|
| `Transaction.Spec` | `changes?`, `selection?`, `effects?`, `annotations?`, `userEvent?`, `scrollIntoView?`, `sequential?`. |
| `tr.state` | Applied state (calls `applyTransaction` once). |
| `tr.docChanged` / `tr.reconfigured` | Convenience flags. |
| `tr.isUserEvent(prefix)` | Match `userEvent` annotation (`"input"` matches `"input.type"`). |
| `Transaction.merge` / `Transaction.append` | Combine specs; run appender facets to fixed point. |
| `Transaction.extender` / `appender` | Facets for pure pre-apply / post-apply hooks. |
| Built-in annotations | `time`, `userEvent`, `addToHistory`, `remote`, `appended`. |

### Selection

```ts
EditorSelection.cursor(pos, side?, goalColumn?)
EditorSelection.range(anchor, head?, headSide?, goalColumn?)
EditorSelection.node(pos, leaf, goalColumn?)
EditorSelection.near(cx, pos, bias?)
EditorSelection.atStart(cx, block?)
EditorSelection.atEnd(cx, block?)
```

Selections map through changes and `check` against the document.

### Fields, facets, compartments

```ts
let count = EditorState.Field.define<number>({
    create: () => 0,
    update: (v, tr) => (tr.docChanged ? v + 1 : v),
})

let tags = EditorState.Facet.define<string, string>({
    combine: (v) => v.join(","),
    static: true,
})

let compartment = EditorState.Compartment.define()
// compartment.of(extension) in config; compartment.reconfigure(next) as an effect
```

### Corrections

```ts
let fixLists = Correction.onChildList(someQuery, (plot) => {
    // return ChangeSet.Spec or null
    return null
})
// Include fixLists.extension in EditorState config
// Skips remote transactions (Transaction.remote)
```

Also: `Correction.onContent`, `Correction.onMarks`, `Correction.check`, `correction.scan(state)`.

### HTML helpers (browser)

| Export | Description |
|--------|-------------|
| `readDoc(schema, source?, options?)` | Normalize `DocSource` → `Plot.Doc`. |
| `htmlStringToElement(html, options?)` | String → detached DOM (optional table wrap, sanitize, Trusted Types). |
| `toAssignableHTML(html, options?)` | Sanitize + optional policy for `innerHTML`. |
| `wrapMap` | Parent wrappers for bare table fragments. |

Arrisa **never** installs an identity Trusted Types policy.

### Textblock / bidi / clusters

| Export | Description |
|--------|-------------|
| `TextblockMap.get(start, plot, ltr)` | Flat string + section map for cursor/bidi. |
| `BidiSpan` | Span with embedding level; `BidiSpan.find`, `strongDir`. |
| `findClusterBreak(str, pos, forward?, includeExtending?)` | Approximate grapheme boundaries (not full UAX #29). |

## Layering / related packages

```
@arrisa/doc
  └─ @arrisa/state   ← you are here
       ├─ @arrisa/phrases
       ├─ @arrisa/history
       ├─ @arrisa/command
       └─ @arrisa/collab
```

| Package | Relation |
|---------|----------|
| [`@arrisa/doc`](https://www.npmjs.com/package/@arrisa/doc) | Document model and `ChangeSet`. |
| [`@arrisa/phrases`](https://www.npmjs.com/package/@arrisa/phrases) | UI strings via state facets. |
| `@arrisa/editor` | View applies transactions from UI/input. |

## Security

- String docs and HTML helpers accept optional `sanitizeHTML` / `trustedHTMLPolicy`.
- Without a sanitizer, untrusted HTML is **not** safe.
- Schema structure is not an XSS boundary.

See repository root [`SECURITY.md`](https://github.com/inshinrei/arrisa/blob/main/SECURITY.md).

## License

MIT
