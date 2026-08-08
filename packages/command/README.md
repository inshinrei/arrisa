# @arrisa/command

Editing commands, menu model, and structure helpers for Arrisa — pure transaction specs, keymaps, and toolbars without owning the view.

## Install

```bash
pnpm add @arrisa/command
```

Depends on `@arrisa/doc`, `@arrisa/state`, `@arrisa/phrases`, and `@arrisa/types`. Pair with [`@arrisa/editor`](https://www.npmjs.com/package/@arrisa/editor) for a live view and [`@arrisa/history`](https://www.npmjs.com/package/@arrisa/history) for real undo/redo.

## Quick start

```ts
import {Command, toggleStrong, enter, undo, redo} from "@arrisa/command"
import {history, undo as histUndo, redo as histRedo} from "@arrisa/history"
import {Arrisa, KeyBinding} from "@arrisa/editor"
import {EditorState} from "@arrisa/state"

// Pure command → Transaction.Spec | false
let result = toggleStrong({state: editor.state}, null)
if (result) editor.dispatch(result)

// Or dispatch through the command protocol (handlers + view commands)
Command.dispatch(editor, enter)

// Wire history stubs so default keymap Mod-z / Mod-y work
let config: EditorState.Extension = [
  history(),
  Command.handler(undo, (ed) => histUndo({state: ed.state})),
  Command.handler(redo, (ed) => histRedo({state: ed.state})),
  KeyBinding.of({key: "Mod-b", run: toggleStrong}),
]
```

## Features / concepts

### Pure vs view commands

| Kind | Signature | When to use |
|------|-----------|-------------|
| **`Command.Pure`** | `({state}, param) => Transaction.Spec \| false` | Unit-testable edits; no DOM geometry |
| **`Command`** | `(target: Arrisa, param) => boolean \| Transaction.Spec` | Needs line/page geometry (`moveToLineBoundary`, `moveVertically`) |

Most high-level commands are pure. View-backed ones: `deleteToLineEnd`, `deleteLine`, `moveByLine`, `moveByPage`, `moveToLineSide`.

### Dispatch protocol

- **`Command.dispatch(editor, cmd)`** / **`Command.dispatch(editor, cmd, param)`** — runs registered handlers first (first truthy wins), then the command body. Specs are applied via `editor.dispatch`.
- **`Command.bind(cmd, param)`** — fix a parameter for menus/keymaps.
- **`Command.handler(cmd, override)`** — extension that overrides a command identity.

### Menu model

`Menu` is a declarative toolbar model: items register via `Menu.Item.source`, templates expand `"..."` into children by `parent` + `rank`, and `Menu.resolve` produces a flat list of buttons, custom controls, submenus, and `|` separators. View packages (`menuBar`, `floatingMenu`) render the resolved tree.

### Undo/redo stubs

`undo` / `redo` from this package always return `false`. They exist as command *identities* for keymaps and menus. Install real history with `@arrisa/history` and `Command.handler` (see playground wiring above).

## Main public API

### Protocol

| Export | Description |
|--------|-------------|
| `Command` | Command type + `handler`, `bind`, `dispatch`, `Pure`, `Bound` |
| `Arrisa` | Minimal view surface (`state`, `dispatch`, line/vertical motion, `scrollDOM`, `dom`). **Not** the full `@arrisa/editor` class — that class *implements* this interface. |
| `Arrisa.coveredMargins` | Facet: chrome margins for page-step motion (shared identity with the editor) |

### Insert

| Export | Description |
|--------|-------------|
| `insertText` | Replace range with text + active marks (`userEvent` required in param) |
| `insertLineBreak` | Schema line-break node or `\n` in preserve-whitespace parents |
| `enter` | Enter key: new textblock / lift empty / split |
| `transposeChars` | Swap grapheme clusters around a cursor |

### Delete (high-level)

| Export | Description |
|--------|-------------|
| `deleteUnit` | Selection, or join + unit delete in `"forward"` \| `"backward"` |
| `deleteWord` | Same, preferring word delete at a cursor |
| `deleteToLineEnd` | View: delete to visual line boundary |
| `deleteLine` | View: delete the visual line |

### Structure

| Export | Description |
|--------|-------------|
| `setTextblockType` | Change selected textblocks to a `Plot.Tag` |
| `wrapBlock` / `unwrapBlock` | Wrap/unwrap selection in a block tag |
| `toggleBlock` | Unwrap if present, else wrap |
| `toggleList` | Put selected textblocks into / out of a list tag |
| `listIsActive` | Predicate factory for list toolbar active state |

### Marks

| Export | Description |
|--------|-------------|
| `toggleMark` | Toggle a mark on selection or stored marks |
| `toggleEmphasis` / `toggleStrong` / `toggleUnderline` | Convenience for `@arrisa/types` marks |
| `setAlignment` | Text-align on textblocks (`null` / `"start"` clears default) |
| `setDirection` | `dir` on textblocks (`null` clears) |

### Mark exclusivity

| Export | Description |
|--------|-------------|
| `markExclusivity` | Extension: isolating mark types + `Command.handler` for `toggleMark` |
| `markExclusivityPolicy` | Read combined policy from state |
| `markAllowedByExclusivity` | Whether a mark may be applied under policy |
| `toggleMarkExclusive` | Toggle with conflict stripping |
| `MarkExclusivityPolicy` | `{isolating: Mark.Type[]}` |

```ts
import {markExclusivity} from "@arrisa/command"
import {Code, Strikethrough} from "@arrisa/types"

// Monospace / strike cannot stack with other formats
markExclusivity({isolating: [Code, Strikethrough]})
```

### Motion

| Export | Description |
|--------|-------------|
| `moveByUnit` | Character/node step (`dir`, optional `extend`) |
| `moveByWord` | Word step (visual left/right) |
| `moveByLine` / `moveByPage` | View-backed vertical motion |
| `moveToLineSide` | Visual line start/end |
| `moveToTextblockSide` | Textblock start/end |
| `moveToDocSide` | Document start/end |
| `selectAll` | Select entire document |

### History placeholders

| Export | Description |
|--------|-------------|
| `undo` / `redo` | No-op commands (`false`); override or use `@arrisa/history` |

### Menu

| Export | Description |
|--------|-------------|
| `Menu.Button.define` / `Menu.Button.toggleMark` | Toolbar buttons |
| `Menu.CustomControl.define` | Custom DOM controls |
| `Menu.Group.define` / `Menu.Group.top` / `.commands` / `.inline` / `.block` / `.insert` | Groups + standard ranks |
| `Menu.Submenu.define` / `Menu.Submenu.textblockStyle` | Submenus |
| `Menu.Template` / `group.template(...)` | Template trees |
| `Menu.resolve(items, template?, suppress?)` | Resolve to actionable list |
| `Menu.Item.source` | Facet that collects registered items |

```ts
import {Menu, toggleStrong, Command} from "@arrisa/command"
import {Strong} from "@arrisa/types"

let boldBtn = Menu.Button.toggleMark({
  mark: Strong,
  parent: Menu.Group.inline,
  rank: 10,
  label: "B",
})

// boldBtn.extension installs the Menu.Item.source facet
// Custom button:
Menu.Button.define({
  run: Command.bind(toggleStrong, null),
  label: "Bold",
  parent: Menu.Group.inline,
  rank: 10,
  active: (state) => !!Strong.isInSet(state.sel.activeMarks),
})
```

### Utils (building blocks)

Used by higher-level commands; also available for custom commands:

| Export | Module |
|--------|--------|
| `deleteSelection`, `deleteEmptyTextblock`, `deleteBackward`, `deleteForward` | delete |
| `joinBackward`, `joinForward`, `joinListItems` | join |
| `liftEmptyBlock`, `splitTextblock` | split |
| `joinBlocks`, `clearNonFitting`, `autoJoinBlocks`, `textblockChild` | blocks |
| `findWrappable`, `wrapBlockRange`, `findUnwrappable`, `doUnwrapBlock` | wrap |
| `selectedTextblocks`, `canAddMarkInRange` | selection |

## Layering / related packages

| Package | Role |
|---------|------|
| `@arrisa/doc` | Document model, changes, schema |
| `@arrisa/state` | `EditorState`, transactions, selection |
| `@arrisa/types` | Standard marks (`Strong`, `Emphasis`, …) used by mark helpers |
| `@arrisa/phrases` | Phrase refs for menu descriptions |
| `@arrisa/history` | Real undo/redo (wire via `Command.handler`) |
| `@arrisa/editor` | View that implements the command `Arrisa` interface; menus, keymaps |
| `@arrisa/schema` | Ready-made extensions that register `Menu` items and key bindings |

**Layer:** depends only on doc/state/types/phrases (layer 2). Does not import `@arrisa/editor`.

## License

MIT
