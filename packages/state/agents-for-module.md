# AGENTS.md

> Guidelines for AI coding agents working in projects that depend on `@arrisa/state` (when installed from npm).
>
> This lightweight guide is copied to `dist/AGENTS.md` during build and ships inside the published package.

## When to use this package

Use `@arrisa/state` for pure editor state: documents, selection, transactions, and extensions (fields/facets). Prefer it over the view when testing commands, collab, or schema behavior.

- Create and update `EditorState`
- Author `Transaction.Spec` from commands or tests
- Register fields, facets, compartments, corrections
- Load docs from JSON/HTML with explicit sanitize options

Depends on `@arrisa/doc`. Does not own the DOM view (`@arrisa/editor` does).

## Public API & common patterns

### Root exports

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

**Not** separate root exports (use namespaces):

- `EditorState.Field`, `EditorState.Facet`, `EditorState.Compartment`, `EditorState.prec`
- `EditorState.schemaElement`, `EditorState.readOnly`, `EditorState.textLTR`, …
- `Transaction.Effect`, `Transaction.Annotation`, `Transaction.userEvent`, `Transaction.remote`, …
- `EditorSelection.cursor` / `range` / `Text` / `Node`

### Create state

```ts
let state = EditorState.create({
    doc, // Plot.Doc | JSON | HTML string/element | (schema) => doc
    selection: {anchor: 1, head: 1}, // or EditorSelection / factory
    config: [EditorState.schemaElement.of(schema.elements), /* extensions */],
    sanitizeHTML: (html) => appSanitize(html), // for untrusted string docs
    // trustedHTMLPolicy: appPolicy,
})
```

Without `schemaElement` or a `Plot.Doc` that carries a schema, create throws.

### Update pattern (pure)

```ts
let tr = state.update({
    changes: {from, to, insert: Slice.of([Leaf.text("x")])},
    selection: EditorSelection.cursor(pos),
    effects: someEffect.of(value),
    annotations: Transaction.addToHistory.of(true),
    userEvent: "input.type",
    scrollIntoView: true,
})
let next = tr.state // applies once; fields/facets update here
```

Commands in higher packages often return `Transaction.Spec | false` for the same reason: pure and testable.

### Fields & facets

```ts
let counter = EditorState.Field.define<number>({
    create: () => 0,
    update: (v, tr) => (tr.docChanged ? v + 1 : v),
})

let label = EditorState.Facet.define<string, string>({
    combine: (values) => values[0] ?? "",
    static: true,
})

state.field(counter)
state.facet(label) // default when absent
state.field(counter, false) // undefined if not in config
```

### Reconfigure / compartments

```ts
// Full replace
state.update({effects: EditorState.reconfigure.of(newExtensions)})

// Partial swap
let c = EditorState.Compartment.define()
// config: c.of(extA)
state.update({effects: c.reconfigure(extB)})

// Append
state.update({effects: EditorState.appendConfig.of(more)})
```

### Corrections

```ts
let c = Correction.onChildList(query, (plot) => changeSpecOrNull)
// config includes c.extension
// extenders skip Transaction.remote and empty docs
```

### HTML string path

```ts
let el = htmlStringToElement(untrusted, {
    sanitize: appSanitize,
    trustedHTMLPolicy: policy, // optional; never identity from Arrisa
    wrapTables: true,
})
let doc = readDoc(schema, untrusted, {sanitizeHTML: appSanitize})
```

## Invariants / pitfalls

1. **State and transactions are immutable** — always `tr.state` / `update`, never mutate `state.doc` or selection internals.
2. **Schema comes from config or doc** — `schemaElement` is the usual path when building from extensions.
3. **Selection must stay valid** — transactions map or check selection against `newDoc`.
4. **Remote vs local** — corrections and many history/collab paths honor `Transaction.remote`; set it on remote applies.
5. **Facet combine order** — higher precedence / earlier providers win depending on facet; use `EditorState.prec.high` when order matters.
6. **Slot cycles** — field/facet `create`/`update` that re-enter the same slot throw; keep dependency graphs acyclic.
7. **Browser-only HTML helpers** — `htmlStringToElement` needs `document.implementation`.

## What not to do

- Do not import non-exported modules (e.g. assume `Field` is a root named export). Use `EditorState.Field`.
- Do not apply remote collab changes without understanding effect filtering (see `@arrisa/collab` + `SECURITY.md`).
- Do not load untrusted HTML strings without `sanitizeHTML` / app sanitizer.
- Do not create an identity Trusted Types policy “for convenience.”
- Do not put view/DOM side effects inside field `update` if a pure `ChangeSet` / correction can do the job.

## Related packages

| Package | Use when |
|---------|----------|
| `@arrisa/doc` | Nodes, schema, `ChangeSet`, parse/serialize. |
| `@arrisa/phrases` | Localized UI labels via facets. |
| `@arrisa/history` | Undo/redo field consuming transactions. |
| `@arrisa/command` | Command functions returning `Transaction.Spec`. |
| `@arrisa/editor` | Bind state to DOM, input, menus. |
| `@arrisa/collab` | OT send/receive over transactions. |

## When in doubt

- [ ] Prefer `state.update(spec)` + `tr.state` over ad-hoc mutation.
- [ ] Put schema elements in config via `EditorState.schemaElement.of(schema.elements)`.
- [ ] Use `EditorSelection.cursor` / `range` factories, not hand-built invalid ranges.
- [ ] Sanitize string/HTML docs; pass Trusted Types only with a real policy.
- [ ] Keep extensions layered: fields/facets for state, commands for intent, view for DOM.

Read the package `README.md` for fuller API tables and security notes.

---

Keep this file in sync with `README.md` when the public API or recommended usage patterns change.
