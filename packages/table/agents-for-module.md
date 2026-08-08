# AGENTS.md

> Guidelines for AI coding agents working in projects that depend on `@arrisa/table` (when installed from npm).
>
> This lightweight guide is copied to `dist/AGENTS.md` during build and ships inside the published package.

## When to use

- Host needs **editable tables** inside an Arrisa document editor (cell selection, structure edits, paste, menu).
- Prefer the **`tables()`** bundle unless you need a stripped install (e.g. headless tests using only commands + `TableMap`).

## Public API patterns

```ts
import {Arrisa, menuBar} from "@arrisa/editor"
import {fullSchema} from "@arrisa/schema"
import {tables, addRow, CellSelection, TableMap} from "@arrisa/table"
import {history} from "@arrisa/history"

let editor = Arrisa.create({
    parent,
    config: [fullSchema(), tables(), history(), menuBar()],
})

// Pure structure command
let spec = addRow({state: editor.state}, "after")
if (spec) editor.dispatch(spec)
```

| Export | Role |
|--------|------|
| `tables(config?)` | Full bundle: types, selection, correction, paste/drop, menu, theme |
| `tables.Spec` | `{headerCells?, cellSpanning?, cellContent?: "inline" \| "block"}` |
| `CellSelection` | Multi-cell selection class + extension chrome |
| `addColumn`, `addRow`, `deleteColumn`, `deleteRow` | Structure commands (`add*` take `"before" \| "after"`) |
| `mergeCells`, `splitCell`, `toggleHeaderCell` | Span / header commands |
| `handleTablePaste`, `insertCells`, `tablePasteHandler`, `tableDropHandler` | Clipboard integration |
| `TableMap`, `Rect`, `Problem` | Grid geometry and structural problems |
| `tableContext`, `cellTag`, `headerCellTag` | Lookup helpers for commands/custom UI |
| `tableCorrection`, `tableMenu`, `tableTheme` | Standalone pieces also nested under `tables.*` |

## Invariants / pitfalls

1. **Types live in `@arrisa/types`** — do not redefine `Table` / `Cell` here; this package registers them via `EditorState.schemaElement`.
2. **`tables()` is the default path** — it already includes correction, paste, menu, and theme. Avoid double-installing the same pieces unless intentional.
3. **Cell content model** — default `"inline"` uses `Cell` / `HeaderCell`; `"block"` uses `BlockCell` / `BlockHeaderCell`. Mixing without a single model confuses `cellTag()`.
4. **Commands are pure** — return `Transaction.Spec | false`. They need selection inside a table (`tableContext`); outside they return `false`.
5. **`mergeCells`** requires a multi-cell `CellSelection` with no overlapping span problems in the rect. **`splitCell`** requires a single spanned cell.
6. **Deleting all rows or all columns** deletes the entire table.
7. **`TableMap.get(table, start)`** — `start` is the document position of the table’s *content* start (as used by `tableContext`). Maps are cached per table plot instance.
8. **`tableCorrection`** runs as a content correction on `Table` and repairs collisions / missing cells / overlong rowspans after local edits.
9. **Paste pure helper** — `handleTablePaste(state, slice, context, drop?)` for tests; facet handlers dispatch for you.
10. Prefer **`let`** in examples; `const` only for arrow functions / true globals.

## What not to do

- Do **not** put table schema element definitions in app code when `@arrisa/types` already exports them.
- Do **not** import reverse layers (e.g. message → table) “for convenience.”
- Do **not** assume HTML paste is safe without `Arrisa.htmlSanitize` / app sanitization.
- Do **not** invent commands not exported from `src/index.ts`.
- Do **not** mutate `TableMap` internals; treat geometry as read-only.

## Related packages

| Package | Use when |
|---------|----------|
| `@arrisa/types` | `Table`, `Cell`, `ColSpan`, `RowSpan`, … |
| `@arrisa/schema` | Surrounding document chrome (`fullSchema`, lists, …) |
| `@arrisa/editor` | View, paste/drop facets, decorations |
| `@arrisa/command` | `Command.dispatch`, menu parents |
| `@arrisa/collab` | Share table docs; pass shared `corrections` including table correction when rebasing |

## When in doubt

- Install `tables()` and verify with unit-style pure commands before adding custom UI.
- Read `README.md` and `dist/index.d.ts` for exact signatures.
- Security: [SECURITY.md](https://github.com/inshinrei/arrisa/blob/main/SECURITY.md).

## Keep in sync

When changing public exports or recommended usage, update this file and `README.md` in the same change. Only document what `src/index.ts` re-exports.
