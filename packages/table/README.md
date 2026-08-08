# @arrisa/table

**Table editing for Arrisa** — cell selection, structure commands (rows/columns/merge/split), paste/drop, structure correction, menu, and theme.

Node/mark types for tables (`Table`, `TableRow`, `Cell`, spans, …) live in `@arrisa/types`. This package is the **editor chrome** and pure helpers that operate on those types.

## Install

```bash
pnpm add @arrisa/table @arrisa/editor @arrisa/schema @arrisa/state @arrisa/doc
# or npm / yarn
```

## Quick start

```ts
import {Arrisa, menuBar} from "@arrisa/editor"
import {fullSchema} from "@arrisa/schema"
import {tables} from "@arrisa/table"
import {history} from "@arrisa/history"

let parent = document.getElementById("editor")!

let editor = Arrisa.create({
    parent,
    config: [
        fullSchema(),
        tables(), // schema elements + selection + paste + menu + theme + correction
        history(),
        menuBar(),
    ],
})
```

Options:

```ts
tables({
    headerCells: true,       // default true — HeaderCell / BlockHeaderCell
    cellSpanning: true,      // default true — ColSpan / RowSpan
    cellContent: "inline",   // or "block" for BlockCell content model
})
```

## Features / concepts

| Piece | Role |
|-------|------|
| `tables()` | Bundle: schema elements, `CellSelection`, correction, paste/drop, menu, theme |
| `CellSelection` | Multi-cell selection model + decorations + mouse/keyboard chrome |
| Structure commands | Pure `Command.Pure` helpers: add/delete row/column, merge, split, header toggle |
| `TableMap` / `Rect` | Cached grid geometry (spans, problems, cell positions) |
| `tableCorrection` | Auto-fix missing cells, span collisions, overlong rowspans |
| Paste/drop | Rectangular cell paste into a cell or cell selection |

### Cell selection

Install via the bundle (or pass `CellSelection` as an extension). Supports multi-cell ranges, triple-click cell select, and arrow motion that collapses or extends by cell.

### Structure commands

All commands take `{state}` and return a transaction spec or `false` (testable without a view):

```ts
import {Command} from "@arrisa/command"
import {addRow, addColumn, deleteRow, deleteColumn, mergeCells, splitCell, toggleHeaderCell} from "@arrisa/table"

// Menu / key handler style
Command.dispatch(editor, addRow, "before")
Command.dispatch(editor, addColumn, "after")

// Pure
let spec = addRow({state: editor.state}, "after")
if (spec) editor.dispatch(spec)
```

| Command | Behavior |
|---------|----------|
| `addRow` / `addColumn` | Insert before or after the selection rect (`"before" \| "after"`) |
| `deleteRow` / `deleteColumn` | Delete covered rows/cols; if all rows/cols selected, delete the whole table |
| `mergeCells` | Merge a multi-cell `CellSelection` into one spanned cell |
| `splitCell` | Split a single cell with col/row span &gt; 1 into unit cells |
| `toggleHeaderCell` | Promote non-headers → headers, or demote if already all headers |

### Paste

```ts
import {handleTablePaste, insertCells, tablePasteHandler, tableDropHandler} from "@arrisa/table"

// Pure (tests / custom handlers)
let tr = handleTablePaste(state, slice, context)
// Facet handlers are included in tables()
```

Pasted table-shaped content is rectangularized (padding empty cells) and clipped/tiled into a cell selection when appropriate.

## Main public API

### Bundle

```ts
import {tables} from "@arrisa/table"

tables()
tables.correction   // same as tableCorrection
tables.pasteHandler
tables.dropHandler
tables.theme
tables.menu         // tableMenu
```

### Menu and theme

```ts
import {tableMenu, tableTheme} from "@arrisa/table"

tableMenu() // createTable, modifyTable, add/delete, merge/split, …
// tableMenu.addRowBelow, tableMenu.mergeCells, … for re-rank/omit
```

### Selection and geometry

```ts
import {CellSelection, TableMap, Rect, type Problem} from "@arrisa/table"

// CellSelection.between(doc, anchor, head)
// TableMap.get(tablePlot, contentStart)
// map.width / map.height / map.problems / map.cellRect(pos) / map.cellsInRect(rect)
```

### Context helpers

```ts
import {tableContext, cellTag, headerCellTag} from "@arrisa/table"

let cx = tableContext(state) // {cells, map} or null outside a table
let cell = cellTag(schema)   // Cell or BlockCell (throws if neither registered)
let header = headerCellTag(schema) // HeaderCell, BlockHeaderCell, or null
```

### Correction

```ts
import {tableCorrection} from "@arrisa/table"
// Included by tables(); also available as tables.correction
```

## Layering / related packages

```
@arrisa/types (Table, Cell, ColSpan, …)
        ↓
@arrisa/table (chrome + pure helpers)
        ↓
host editor (usually with @arrisa/schema full/basic)
```

Internal layering (acyclic): `table-map` → `context` / `cell-selection` → `commands` / `paste` / `correct` → `menu` → `tables()` composition.

| Package | Relationship |
|---------|----------------|
| `@arrisa/types` | Table / cell / span schema elements |
| `@arrisa/schema` | Document blocks/marks; combine with `tables()` |
| `@arrisa/editor` | Paste/drop facets, decorations, styles |
| `@arrisa/command` | Menu model and command dispatch |
| `@arrisa/phrases` | `tablePhrases` labels |

## Security

Paste and drop of table HTML still go through the editor’s HTML parse path. Untrusted clipboard content requires app-level sanitization (`Arrisa.htmlSanitize`). Structure validation is not XSS protection. See [SECURITY.md](https://github.com/inshinrei/arrisa/blob/main/SECURITY.md).

## License

MIT © [inshinrei](https://github.com/inshinrei)
