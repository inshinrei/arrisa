# @arrisa/phrases

**Typed UI phrase catalogs and locale overrides for Arrisa `EditorState`.**

Define frozen English (or base) string maps, resolve them against editor state, and register translations via extensions. Higher packages (`@arrisa/command`, `@arrisa/editor`, `@arrisa/table`, …) use the built-in catalogs for menus, dialogs, and table UI.

## Install

```bash
pnpm add @arrisa/phrases
```

Depends on `@arrisa/state` (and transitively `@arrisa/doc`).

## Quick start

```ts
import {EditorState} from "@arrisa/state"
import {PhraseSet, phrases, tablePhrases} from "@arrisa/phrases"

// Built-in catalogs
phrases.get(state, "undo") // "Undo"
tablePhrases.get(state, "dimensions_live", 3, 4) // "3 by 4"

// Locale override extension
let de = phrases.translatePartial({
    undo: "Rückgängig",
    redo: "Wiederholen",
})

let state = EditorState.create({
    doc,
    config: [
        EditorState.schemaElement.of(schema.elements),
        de, // put locale packs early or wrap with EditorState.prec.high
    ],
})

// Custom set
let myPhrases = PhraseSet.define({
    save: "Save",
    status: "Saved $1 items",
})
myPhrases.get(state, "status", 3) // "Saved 3 items"
```

## Features / concepts

| Concept | Role |
|---------|------|
| **PhraseSet** | Frozen tag → default string map; typed tags. |
| **get / ref** | Resolve with overrides + `$n` interpolation. |
| **translate / translatePartial** | `EditorState.Extension` providers for full or partial overrides. |
| **didChange** | Detect phrase-override reconfiguration between states. |
| **Built-in catalogs** | Core UI, image dialogs, color names, table chrome. |

### Interpolation

- `$1`, `$2`, … — insert the n-th extra argument (1-based).
- Bare `$` — treated as `$1`.
- `$$` — literal `$`.
- Markers without a matching argument are left unchanged.
- With no insert args, the template is returned as-is (including `$1`).

### Override merge order

Providers are combined so **higher precedence / earlier-in-list keys win**. Put locale packs first in `config`, or use `EditorState.prec.high(...)`.

## Main public API

```ts
import {
    PhraseSet,
    phrases,
    imagePhrases,
    colorNames,
    tablePhrases,
} from "@arrisa/phrases"
```

### PhraseSet

| API | Description |
|-----|-------------|
| `PhraseSet.define({ tag: "string", … })` | Create a set; freezes the map. |
| `set.get(state, tag, …insert)` | Resolve with overrides + format. |
| `set.ref(tag)` | `(state, …insert) => string` bound getter. |
| `set.translate(allTags)` | Extension replacing every phrase. |
| `set.translatePartial(someTags)` | Extension overriding a subset. |
| `PhraseSet.didChange(a, b)` | `true` if override facet identity changed. |
| `PhraseSet.Tag<Set>` | Type helper: union of tags. |
| `PhraseSet.Ref` | Type of `ref` callbacks. |

### Built-in catalogs

| Export | Scope (examples) |
|--------|------------------|
| `phrases` | Undo/redo, block styles, mark toggles, link/color labels, alignment, direction, dialog close. |
| `imagePhrases` | Insert/update image dialog, figure styles, alt, upload states. |
| `colorNames` | Palette labels (`red`, `darker`, `none`, …). |
| `tablePhrases` | Dimension live/title (`$1`×`$2`), insert/modify table, row/col ops, merge/split. |

Tags are TypeScript-checked: `phrases.get(state, "undo")` is valid; unknown tags fail at compile time.

## Layering / related packages

```
@arrisa/doc → @arrisa/state → @arrisa/phrases   ← you are here
```

Consumers: `@arrisa/command`, `@arrisa/editor`, `@arrisa/schema`, `@arrisa/table`, `@arrisa/message` (UI labels).

| Package | Relation |
|---------|----------|
| [`@arrisa/state`](https://www.npmjs.com/package/@arrisa/state) | Facet storage for overrides; `EditorState` required for `get`. |
| `@arrisa/editor` | Renders phrases in menus, dialogs, tooltips. |

## Security

Phrase catalogs are static UI strings. They do not sanitize HTML or URLs. Do not put untrusted user content into phrase **templates** without escaping at the display boundary.

## License

MIT
