# AGENTS.md

> Guidelines for AI coding agents working in projects that depend on `@arrisa/doc` (when installed from npm).
>
> This lightweight guide is copied to `dist/AGENTS.md` during build and ships inside the published package.

## When to use this package

Use `@arrisa/doc` when you need the Arrisa document tree, schema, pure document transforms, or HTML parse/serialize **without** the editor view.

- Define custom node/mark types and a `Schema`
- Build or validate `Plot.Doc` trees
- Apply `ChangeSet` transforms (insert, delete, marks, OT compose/transform)
- Parse/serialize HTML against a schema

Do **not** reach into other Arrisa packages for the model itself — this is the foundation and has no dependencies.

## Public API & common patterns

### Exports (only these are public)

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

Do not invent exports. Nested APIs hang on the classes/namespaces above (`Schema.define`, `Leaf.text`, `ChangeSet.create`, `parse.slice`, …).

### Define a minimal schema

```ts
let paragraph = Plot.define("paragraph", {
    inlineContent: true,
    shape: {element: "p"},
})
let bold = Mark.define("bold", {shape: {element: "strong"}})
let docType = Plot.defineDoc({blockContent: paragraph})
let schema = Schema.define([docType, paragraph, bold])
```

Rules agents must respect:

- Exactly one document type (`Plot.defineDoc` or equivalent) per schema.
- Node/mark **names** unique; element **instances** may be listed more than once (deduped/cached).
- Inline vs block content must be consistent (`Schema.define` throws `SchemaError` on mismatch).
- At most one line-break leaf (`Node.Role.LineBreak`), inline, with default param.

### Build documents and text

```ts
let doc = schema.doc([paragraph.create([Leaf.text("hello")])])
// Prefer Leaf.text for text; adjacent same-mark text merges on pushTo
let strongHello = Leaf.text("hello", [bold])
```

### Positions

- Plots contribute open + close (length `2 + contentLength`); non-text leaves length 1; text leaves use string length.
- Resolve with `Pos.resolve(doc, pos)` (throws if out of range).
- Prefer mapping through `ChangeSet.mapPos` after edits instead of recomputing by hand.

### Changes

```ts
// Replace / insert / delete
let tr = ChangeSet.create(doc, {
    from: 1,
    to: 3,
    insert: Slice.of([Leaf.text("X")]),
})
let next = tr.apply(doc)

// Marks: do not combine add/remove with insert on the same change object
let withMark = ChangeSet.create(doc, {from: 1, to: 6, add: bold}).apply(doc)

// Compose / invert / OT
let inverted = tr.invert(doc)
let composed = a.compose(b)
let {a: ma, b: mb} = ChangeSet.transform(doc, a, b)
```

`ChangeSet.Spec` may be a single change, an array, an existing `ChangeSet`, or `{correct, local?}`.

### HTML

```ts
// Browser only for parse (needs Element / DocumentFragment)
let loaded = parse(schema, element, {collapseWhiteSpace: true})
let vdom = serialize(loaded)
// serialize.node(node, opts) / serialize.slice(slice, opts)
```

### JSON

```ts
let json = doc.toJSON()
let again = schema.docFromJSON(json)
let node = schema.nodeFromJSON(json.content![0])
```

## Invariants / pitfalls

1. **Immutability** — never mutate node content arrays, mark sets, or change section arrays in place. Use `withMarks`, `type.of`, `create`, `ChangeSet` apply.
2. **Schema identity** — tags/types must be the same object instances present in the schema (`schema.has(tag)`). Loading two copies of `@arrisa/doc` breaks `instanceof` / identity checks.
3. **Length must match** — `change.apply(doc)` throws if `change.length !== doc.length`.
4. **Marks live on tags** — text marks hang on the leaf instance; plot marks hang on `Plot.Tag`, not as child nodes.
5. **Shape is type-only at the export** — import `type {Shape}`; runtime builders are `NodeShape`, `Elt`, `Attributes`.
6. **Validation vs security** — `schema.validate` checks structure and mark targets only; it does not sanitize HTML or URLs.

## What not to do

- Do not treat `parse` + schema rules as XSS protection. Sanitize untrusted HTML before DOM insertion.
- Do not invent public helpers that are not re-exported from the package root.
- Do not put reverse dependencies on `@arrisa/state` / `@arrisa/editor` inside pure model code that should stay layer 0.
- Do not combine mark add/remove and replace/`insert` on one `ChangeSet.Change` object (API rejects it).
- Do not assume plot length equals visible character count.

## Related packages

| Package | Use when |
|---------|----------|
| `@arrisa/types` | Standard `Paragraph`, `Heading`, `Strong`, `Link`, tables, URL/color safety. |
| `@arrisa/state` | `EditorState`, selection, transactions wrapping `ChangeSet`. |
| `@arrisa/editor` | DOM view, input, menus. |
| `@arrisa/collab` | OT collab pipeline over change sets. |

## When in doubt

- [ ] Is the symbol exported from `@arrisa/doc` `src/index.ts` / package root?
- [ ] Does the schema include a single doc type and only identity-known tags?
- [ ] Are document positions accounting for open/close tokens?
- [ ] Is untrusted HTML sanitized before `parse` / `innerHTML`?
- [ ] Prefer pure `ChangeSet` + `apply` for edits that must be testable without a view.

Read the package `README.md` (shipped alongside this file) for human-oriented examples.

---

Keep this file in sync with `README.md` when the public API or recommended usage patterns change.
