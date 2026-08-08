# @arrisa/doc

**Immutable document model, schema, change sets, and HTML I/O for Arrisa.**

Foundation package with no dependencies. Everything else in the monorepo builds on this tree: nodes (`Leaf` / `Plot`), marks, `Schema`, `ChangeSet`, slices/tokens, positions, and HTML parse/serialize.

## Install

```bash
pnpm add @arrisa/doc
```

## Quick start

```ts
import {Schema, Plot, Leaf, Mark, ChangeSet, Slice, parse, serialize} from "@arrisa/doc"

let paragraph = Plot.define("paragraph", {
    inlineContent: true,
    shape: {element: "p"},
})
let bold = Mark.define("bold", {shape: {element: "strong"}})
let docType = Plot.defineDoc({blockContent: paragraph})

let schema = Schema.define([docType, paragraph, bold])

// Build a document (open/close tokens around content → length includes structure)
let doc = schema.doc([paragraph.create([Leaf.text("hello")])])
// "hello" textblock: positions 0 open, 1..5 text, 6 close → length 7

// Mark a range
let marked = ChangeSet.create(doc, {from: 1, to: 6, add: bold}).apply(doc)

// Replace text
let next = ChangeSet.create(marked, {
    from: 2,
    to: 5,
    insert: Slice.of([Leaf.text("i")]),
}).apply(marked)

// HTML (browser DOM for parse)
// let loaded = parse(schema, someElement)
// let vdom = serialize(next)
```

## Features / concepts

| Concept | Role |
|---------|------|
| **Leaf** | Terminal node (text or atom). Text length = string length; other leaves length 1. |
| **Plot** | Branch node with ordered children. Length = `2 + contentLength` (open + close), except the document root. |
| **Mark** | Annotation on a tag (not a separate tree node). Sets stay sorted by rank. |
| **Schema** | Allowed nodes/marks, content queries, mark targets, JSON/HTML rules. |
| **Shape / Elt** | Virtual DOM templates for serialize and schema shapes. |
| **ChangeSet** | Length-preserving transform: keep ranges (optional mark mods) + replace ranges (slices). |
| **Slice / Token** | Open tag / full node / close end stream for fragments and replacements. |
| **Pos** | Resolved position into a document (parent path, index, optional text offset). |

Positions treat structure as tokens: plots open and close, non-text leaves occupy one unit, text spans by code unit length.

## Main public API

Exports from `@arrisa/doc` match `src/index.ts`:

```ts
import {
    Node,
    Leaf,
    Plot,
    Mark,
    type Shape,
    Elt,
    Attributes,
    NodeShape,
    isSafeAttributeName,
    Schema,
    SchemaError,
    ValidationError,
    ChangeSet,
    Slice,
    Token,
    Pos,
    parse,
    serialize,
} from "@arrisa/doc"
```

### Document model

| Export | Description |
|--------|-------------|
| `Node` | Union type `Plot \| Leaf`, plus namespace: `Node.Group`, `Node.Role`, `Node.Query`, JSON/spec helpers. |
| `Leaf` | Terminal node. `Leaf.define(name, spec)`, `Leaf.text(str, marks?)`, built-in `Leaf.Text`. |
| `Plot` | Branch node. `Plot.define(name, spec)`, `Plot.defineDoc({…})`, `Plot.Doc` / document helpers, `tag.create(children)`. |
| `Mark` | Mark instance + `Mark.define` / `Mark.Type.define`, set helpers (`addToSet`, `removeFromSet`, `Mark.none`). |
| `Pos` | `Pos.resolve(doc, pos)`, path navigation, `advance`, `nodeAfter` / `nodeBefore`. |
| `Slice` | Fragment of tokens. `Slice.of(tokens)`, `Slice.empty`, `fromJSON`, `slice`/`concat`/`eq`. |
| `Token` | Stream unit: full `Node`, open `Plot.Tag`, or `Token.End` (close). |

### Schema

| API | Description |
|-----|-------------|
| `Schema.define(elements)` | Build (or reuse cached) schema. Requires exactly one document type. |
| `schema.doc(children)` | Create a document under this schema. |
| `schema.validate(node)` | Deep structural + mark-target check (memoized). |
| `schema.canContain` / `markAllowed` / `matchNode` | Content and mark queries. |
| `schema.nodeFromJSON` / `docFromJSON` / `tagFromJSON` | Deserialize with validation. |
| `Schema.Override` | `markTarget`, `plotContent`, `nodeGroup` overrides. |
| `SchemaError` / `ValidationError` | Schema definition vs document validation failures. |

Element specs use `shape` (`Shape.Element` or `Shape.Structure`) and optional `parseRules`, groups, roles, etc.

### Shapes / virtual DOM

| Export | Description |
|--------|-------------|
| `Shape` | Type-only namespace: `Element`, `Structure`, `Attribute`, `Attributes` specs. |
| `NodeShape.from` | Resolve a node shape into `create(param) → Elt`. |
| `Elt` | Immutable virtual element: `Elt.mk`, `Elt.create`, fill/holes, `toDOM` / HTML helpers on the class. |
| `Attributes` | Sorted attribute bag for `Elt`. |
| `isSafeAttributeName` | Rejects dangerous attribute names (e.g. `on*`) on serialize/attr paths. |

### Changes

| API | Description |
|-----|-------------|
| `ChangeSet.create(doc, spec)` | Build from replace / mark / compose / correct specs. |
| `change.apply(doc)` | Produce the new document. |
| `change.invert(doc)` | Inverse for undo-style application. |
| `change.compose(other)` | Sequential composition. |
| `ChangeSet.transform(doc, a, b)` | OT transform pair. |
| `change.mapPos(pos, assoc?)` | Map positions through the change. |
| `ChangeSet.empty(length)` | Identity keep of `length`. |
| `change.toJSON` / `ChangeSet.fromJSON` | Wire/persistence form. |

Typical change object:

```ts
// Replace or insert
{from, to, insert: Slice, fit?: boolean}

// Marks (not combined with insert on the same object)
{from, to, add: Mark}
{from, to, remove: Mark}

// Nested
[changeA, changeB]
{correct: innerSpec, local?: boolean}
```

### HTML I/O

| API | Description |
|-----|-------------|
| `parse(schema, elementOrFragment, options?)` | DOM → `Plot.Doc` (browser). |
| `parse.slice(schema, …)` | DOM → open slice + context. |
| `serialize(doc, options?)` | Doc → `Elt.Fragment`. |
| `serialize.node` / `serialize.slice` | Single node or slice serialization. |

`parse` requires a real DOM (`Element` / `DocumentFragment`). Schema rules and ignore lists shape the model; they are **not** an XSS sanitizer.

## Layering / related packages

```
@arrisa/doc          ← you are here (layer 0)
  ├─ @arrisa/state
  └─ @arrisa/types
```

| Package | Relation |
|---------|----------|
| [`@arrisa/state`](https://www.npmjs.com/package/@arrisa/state) | `EditorState`, selection, transactions over docs. |
| [`@arrisa/types`](https://www.npmjs.com/package/@arrisa/types) | Standard nodes/marks (`Paragraph`, `Strong`, `Link`, …). |
| `@arrisa/editor` | View layer (depends on state + command stack). |

## Security

- Schema validation is **not** an XSS boundary.
- Untrusted HTML must be sanitized **before** DOM assignment / `parse` (see app hooks in `@arrisa/state` / `@arrisa/editor`).
- `isSafeAttributeName` helps on attribute **names** only; values still need app policy where relevant.

Full guidance: repository root [`SECURITY.md`](https://github.com/inshinrei/arrisa/blob/main/SECURITY.md).

## License

MIT
