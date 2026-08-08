# AGENTS.md

> Guidelines for AI coding agents working in projects that depend on `@arrisa/command` (when installed from npm).
>
> This lightweight guide is copied to `dist/AGENTS.md` during build and ships inside the published package.

## When to use this package

Use `@arrisa/command` when you need:

- Pure editing actions that return `Transaction.Spec | false` (testable without DOM)
- A shared command protocol (`Command.dispatch`, handlers, bind for keymaps/menus)
- Declarative toolbar items (`Menu`) consumed by `@arrisa/editor` chrome
- Structure/mark/motion primitives for custom keymaps or schema extensions

Do **not** use this package alone for a full editor UI — pair with `@arrisa/state`, a schema (`@arrisa/types` / `@arrisa/schema`), and typically `@arrisa/editor`.

## Public API & common patterns

### Command shape

```ts
import {type Command, type Command as CmdNS} from "@arrisa/command"
// Prefer: import {Command, toggleMark, enter} from "@arrisa/command"

// Pure: only needs state
let pure: Command.Pure<Mark> = ({state}, mark) => /* Spec | false */

// View: may use editor geometry
let viewCmd: Command<"forward" | "backward"> = (editor, dir) => /* Spec | boolean | false */
```

### Dispatch

```ts
import {Command, enter, toggleStrong} from "@arrisa/command"

// Unparameterized
Command.dispatch(editor, enter)

// Parameterized
Command.dispatch(editor, toggleMark, Strong)

// Bound (menus / KeyBinding.run)
Command.dispatch(editor, Command.bind(deleteUnit, "backward"))
```

Always prefer returning `Transaction.Spec | false` from pure commands so unit tests can `state.update(spec)` without a view.

### Override with handlers

```ts
import {Command, undo, redo} from "@arrisa/command"
import {history, undo as histUndo, redo as histRedo} from "@arrisa/history"

// Default keymap binds Mod-z to command.undo (stub). Wire real history:
history(),
Command.handler(undo, (ed) => histUndo({state: ed.state})),
Command.handler(redo, (ed) => histRedo({state: ed.state})),
```

First handler that returns a truthy result wins; then the command body runs.

### Menu items

```ts
import {Menu, Command, toggleMark} from "@arrisa/command"
import {Strong} from "@arrisa/types"

// Preferred for marks (active + exclusivity-aware enable)
Menu.Button.toggleMark({
  mark: Strong,
  parent: Menu.Group.inline,
  rank: 10,
  label: "B",
})

// Custom
Menu.Button.define({
  run: Command.bind(myCommand, param),
  label: "…",
  parent: Menu.Group.commands,
  rank: 20,
  enable: (state) => !state.readOnly,
  active: (state) => false,
})
```

Install each item’s `.extension` (or the parent group) in `EditorState` config. View packages call `Menu.resolve` internally.

### Structure / lists

```ts
import {setTextblockType, toggleList, listIsActive, wrapBlock} from "@arrisa/command"

// Tags come from schema / @arrisa/types
Command.dispatch(editor, setTextblockType, headingTag)
Command.dispatch(editor, toggleList, bulletListTag)
let isList = listIsActive(bulletListTag)(editor.state)
```

### Mark exclusivity

```ts
import {markExclusivity, markAllowedByExclusivity} from "@arrisa/command"

// Isolating types strip other marks when applied
markExclusivity({isolating: [Code, Strikethrough]})
```

Installs a `Command.handler` on `toggleMark` so keymaps/menus pick it up automatically.

## Invariants / pitfalls

1. **`undo` / `redo` from this package are stubs** — always return `false` until overridden or rebound to `@arrisa/history`.
2. **Two different `Arrisa` symbols** — `@arrisa/command` exports a *minimal interface*; `@arrisa/editor` exports the *view class*. The class implements the interface; do not import the editor class into command-layer code.
3. **Commands do not auto-dispatch** when called as functions — only `Command.dispatch` applies specs. Pure usage: `let spec = cmd({state}, p); if (spec) state = state.update(spec).state`.
4. **View commands need a real editor** (or mock with `moveToLineBoundary` / `moveVertically` / `scrollDOM` / `dom`).
5. **Mark helpers assume schema content** — `setAlignment` / `setDirection` return `false` if the schema lacks those mark types.
6. **Menu ranks** are clamped to `0…100` (default `100`). Lower ranks sort first within a group.
7. **Layering** — this package must not import `@arrisa/editor` or higher packages.

## What not to do

- Do not invent command return types that always mutate the editor — keep pure commands pure.
- Do not call `editor.dispatch` inside a pure command body; return a `Transaction.Spec`.
- Do not treat schema validation as XSS safety (that is app + editor sanitize hooks).
- Do not reimplement undo inside this package; use `@arrisa/history` + handlers.
- Do not register menu items without their `extension` (items will not appear in resolve).

## Related packages

| Package | Use with command |
|---------|------------------|
| `@arrisa/state` | State, transactions, selection |
| `@arrisa/doc` | Tags, marks, changes |
| `@arrisa/types` | Standard mark/node elements |
| `@arrisa/phrases` | `phrases.ref(...)` for menu descriptions |
| `@arrisa/history` | Real undo/redo |
| `@arrisa/editor` | View, `KeyBinding`, `menuBar`, `floatingMenu` |
| `@arrisa/schema` | Batteries-included schema + menus |

## When in doubt

1. Is the action pure? Prefer `Command.Pure` and unit-test with `EditorState.update`.
2. Does the default keymap already bind it? Check editor `KeyBinding.defaultKeymap` before adding duplicates.
3. Need undo? Install `history()` and `Command.handler` for `undo`/`redo` identities.
4. Need a toolbar button? `Menu.Button.define` / `toggleMark` + install `.extension`.
5. Need exclusive marks? `markExclusivity({isolating: [...]})`.
6. Only document and use exports from `@arrisa/command`’s package entry (`src/index.ts` / package root).

## Keep in sync with README

When changing public API or recommended patterns, update this file and `README.md` together.
