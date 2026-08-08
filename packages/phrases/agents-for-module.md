# AGENTS.md

> Guidelines for AI coding agents working in projects that depend on `@arrisa/phrases` (when installed from npm).
>
> This lightweight guide is copied to `dist/AGENTS.md` during build and ships inside the published package.

## When to use this package

Use `@arrisa/phrases` for editor UI strings that must support locale overrides without scattering literals through menus and dialogs.

- Read built-in labels: `phrases`, `imagePhrases`, `colorNames`, `tablePhrases`
- Define app-specific `PhraseSet`s for custom chrome
- Register translations with `translate` / `translatePartial` extensions

Depends on `@arrisa/state`. Not for document content (that is `@arrisa/doc` / `@arrisa/types`).

## Public API & common patterns

### Exports

```ts
import {
    PhraseSet,
    phrases,
    imagePhrases,
    colorNames,
    tablePhrases,
} from "@arrisa/phrases"
```

Only these symbols are public. Catalogs are `PhraseSet` instances created with `PhraseSet.define`.

### Resolve a phrase

```ts
phrases.get(state, "undo")
tablePhrases.get(state, "dimensions_live", rows, cols)

let closeLabel = phrases.ref("dialog_close")
closeLabel(state) // same as get without inserts
```

Always pass a real `EditorState`. Overrides come from that state’s facet providers.

### Define a custom set

```ts
let appPhrases = PhraseSet.define({
    publish: "Publish",
    count: "$1 selected",
})

appPhrases.get(state, "count", n)
```

Maps are frozen. Tags are the TypeScript key union.

### Locales

```ts
// Full replacement (all tags required)
let full = phrases.translate({
    dialog_close: "fermer",
    undo: "annuler",
    // …every tag
})

// Partial (recommended for sparse packs)
let partial = phrases.translatePartial({
    undo: "annuler",
    redo: "rétablir",
})

EditorState.create({
    doc,
    config: [
        EditorState.prec.high(partial), // win over later providers
        EditorState.schemaElement.of(schema.elements),
        // …
    ],
})
```

Merge rule: higher precedence / earlier providers win on key conflicts. Different `PhraseSet` instances never share overrides.

### React to locale reconfigure

```ts
if (PhraseSet.didChange(prevState, nextState)) {
    // rebuild menu labels, etc.
}
```

Document-only transactions do **not** set `didChange`.

### Interpolation rules

| Pattern | Meaning |
|---------|---------|
| `$1`…`$n` | `String(insert[n-1])` |
| `$` | Same as `$1` |
| `$$` | Literal `$` |
| `$9` with fewer inserts | Left unchanged |
| No inserts | Template unchanged |

## Invariants / pitfalls

1. **Defaults live on the set; overrides live on state** — call `get(state, tag)`, not a global locale map.
2. **Overrides are per PhraseSet instance** — translating `phrases` does not affect `tablePhrases`.
3. **`translate` requires every tag** — use `translatePartial` for incomplete packs.
4. **Precedence matters** — same-precedence list order: first wins; use `EditorState.prec.high` for locales when mixed with other providers.
5. **Not DOM-safe HTML** — values are plain strings for attributes/text; escape if you ever inject into HTML.
6. **Built-in English defaults** — catalogs ship base English; apps own localization packs.

## What not to do

- Do not hardcode UI strings in menus when a catalog tag already exists (`phrases.get(state, "toggle_strong")`).
- Do not invent root exports (`PhraseSet.translate` is an **instance** method).
- Do not store untrusted user HTML in phrase templates.
- Do not expect phrase changes from document edits — only from config/facet reconfiguration.
- Do not import internal catalog modules as public API; use the package root.

## Related packages

| Package | Use when |
|---------|----------|
| `@arrisa/state` | Host state + `EditorState.prec` for override order. |
| `@arrisa/command` / `@arrisa/editor` | Menu/dialog labels resolved via these catalogs. |
| `@arrisa/table` | Table chrome phrases (`tablePhrases`). |
| `@arrisa/schema` | Schema UI wiring that uses phrase tags. |

## When in doubt

- [ ] Is the symbol one of `PhraseSet`, `phrases`, `imagePhrases`, `colorNames`, `tablePhrases`?
- [ ] Are you passing `EditorState` into `get` / `ref`?
- [ ] Are locale extensions registered in config with correct precedence?
- [ ] Use `$1`/`$2` for dynamic numbers/names instead of string concatenation at call sites.
- [ ] Use `PhraseSet.didChange` before rebuilding label-heavy UI after reconfigure.

Read the package `README.md` for catalog scope and install notes.

---

Keep this file in sync with `README.md` when the public API or recommended usage patterns change.
