# AGENTS.md

> Guidelines for AI coding agents working in projects that depend on `@arrisa/history` (when installed from npm).
>
> This lightweight guide is copied to `dist/AGENTS.md` during build and ships inside the published package.

## When to use this package

Install `@arrisa/history` whenever the editor should support undo/redo:

- Document apps with sticky toolbars
- Messenger compose with floating formatters
- Any `EditorState` that records local user edits

Skip only for read-only viewers or ephemeral previews that must not retain history.

## Public API & common patterns

### Install the extension

```ts
import {history, undo, redo, undoDepth, redoDepth} from "@arrisa/history"

config: [
  history(), // or history({minDepth: 200, newGroupDelay: 300})
]
```

### Apply commands (pure)

```ts
let spec = undo({state: editor.state})
if (spec) editor.dispatch(spec)

// Depth for UI enablement
let canUndo = undoDepth(editor.state) > 0
let canRedo = redoDepth(editor.state) > 0
```

### Wire `@arrisa/command` stubs (playground pattern)

Default editor keymap binds `Mod-z` / `Mod-y` to `@arrisa/command`’s no-op `undo`/`redo`. Override:

```ts
import {Command, undo as cmdUndo, redo as cmdRedo, Menu} from "@arrisa/command"
import {history, undo as histUndo, redo as histRedo} from "@arrisa/history"

function historyChrome(): EditorState.Extension {
  return [
    history(),
    Command.handler(cmdUndo, (ed) => histUndo({state: ed.state})),
    Command.handler(cmdRedo, (ed) => histRedo({state: ed.state})),
  ]
}

// Optional menu buttons using command identities
Menu.Button.define({
  run: cmdUndo,
  label: "Undo",
  parent: Menu.Group.commands,
  rank: 10,
})
```

Alternatively, bind keys directly to history commands without handlers.

### Grouping and isolation

```ts
import {history} from "@arrisa/history"
import {Transaction} from "@arrisa/state"

// Adjacent input.type within newGroupDelay → one undo step (default)
// Force a hard boundary:
annotations: history.isolate.of("full")

// Do not record (collab remote, programmatic fixups):
annotations: Transaction.addToHistory.of(false)
```

### Custom effects

```ts
history.invertedEffects.of((tr) => {
  // return effects that invert side effects present on tr
  return []
})
```

### Persist stacks

Field map keys are caller-chosen. Cast is needed because `history.field` is typed as `Field<unknown>`:

```ts
let fields = {hist: history.field as EditorState.Field<any>}
let json = state.toJSON(fields)
let restored = EditorState.fromJSON(json, [/* schema… */, history()], fields)
```

## Invariants / pitfalls

1. **Commands return specs** — never assume `undo(editor)` dispatches; always apply the result.
2. **Missing extension** — without `history()`, `undo`/`redo` return `false` and depths are `0`.
3. **Read-only** — `undo`/`redo` return `false` when `state.readOnly` is true even if depth &gt; 0.
4. **Command package stubs** — `@arrisa/command` exports different `undo`/`redo` (always `false`). Do not import history commands under the same name without aliasing.
5. **Redo is cleared** by new recorded edits after undo (standard branching).
6. **Non-history changes still map** positions in existing events so later undo remains valid.
7. **Layering** — do not import `@arrisa/editor` from history-dependent pure code; history is state-only.

## What not to do

- Do not implement a second undo stack next to `history()`.
- Do not call history commands without checking for `false`.
- Do not forget `Command.handler` if the UI/keymap still targets `@arrisa/command` undo/redo identities.
- Do not record remote collab updates into local history unless intentional (`addToHistory: false` is the usual default for remote).
- Do not set absurdly low `minDepth` without understanding dropped events.

## Related packages

| Package | Relationship |
|---------|----------------|
| `@arrisa/state` | Hosts the history field; `Transaction.addToHistory` |
| `@arrisa/doc` | Change mapping for events |
| `@arrisa/command` | Stub identities + menus; wire with handlers |
| `@arrisa/editor` | Default keymap uses command stubs |
| `@arrisa/collab` | Remote updates typically exclude history |

## When in doubt

1. Is `history()` in the state config?
2. Are keymap/menu using `@arrisa/command` stubs? → add `Command.handler`.
3. Should this edit be undoable? → default yes; use `addToHistory.of(false)` for remote/sync.
4. Should typing merge? → tune `newGroupDelay` / `joinToEvent` / `history.isolate`.
5. Need JSON round-trip? → include `history.field`.
6. Only use exports from the package entry: `history`, `undo`, `redo`, `undoDepth`, `redoDepth`, `HistoryConfig`, `HistoryCommand`.

## Keep in sync with README

When changing public API or recommended patterns, update this file and `README.md` together.
