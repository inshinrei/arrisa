# @arrisa/history

Undo/redo history for Arrisa editor state — grouped events, configurable depth, and pure undo/redo commands.

## Install

```bash
pnpm add @arrisa/history
```

Depends on `@arrisa/doc` and `@arrisa/state`. For keymaps/menus that use command identities from `@arrisa/command`, wire handlers as shown below.

## Quick start

```ts
import {history, undo, redo, undoDepth, redoDepth} from "@arrisa/history"
import {Command, undo as cmdUndo, redo as cmdRedo} from "@arrisa/command"
import {EditorState} from "@arrisa/state"

let state = EditorState.create({
  doc,
  config: [
    // …schema extensions…
    history({minDepth: 100, newGroupDelay: 500}),
    // Optional: connect default keymap Mod-z / Mod-y
    Command.handler(cmdUndo, (ed) => undo({state: ed.state})),
    Command.handler(cmdRedo, (ed) => redo({state: ed.state})),
  ],
})

// After edits…
let spec = undo({state})
if (spec) state = state.update(spec).state

undoDepth(state) // number of undo groups
redoDepth(state) // number of redo groups
```

With a live editor:

```ts
import {Arrisa} from "@arrisa/editor"
import {history, undo, redo} from "@arrisa/history"
import {Command, undo as cmdUndo, redo as cmdRedo} from "@arrisa/command"

let editor = Arrisa.create({
  parent,
  doc: "<p>Hello</p>",
  config: [
    history(),
    Command.handler(cmdUndo, (ed) => undo({state: ed.state})),
    Command.handler(cmdRedo, (ed) => redo({state: ed.state})),
  ],
})
```

## Features / concepts

### Recording

Document changes (and optional inverted effects) are stored as linked events on a done branch; undo moves them to an undone branch. Adjacent typing/deletes can **join** into one undo step when they occur within `newGroupDelay` and pass `joinToEvent`.

### Pure commands

`undo` / `redo` return `Transaction.Spec | false`. They never dispatch themselves — apply with `state.update` or `editor.dispatch`.

### Opt-out and boundaries

| Mechanism | Effect |
|-----------|--------|
| `Transaction.addToHistory.of(false)` | Edit without recording (still maps existing events) |
| `history.isolate.of("before" \| "after" \| "full")` | Force a group boundary relative to neighbors |
| `EditorState.readOnly` | Commands return `false` (history may still record if other code applies changes) |

### Custom effects

Register `history.invertedEffects` providers so non-document effects can be inverted and restored on undo/redo.

### Serialization

Include `history.field` in the field map for `state.toJSON` / `EditorState.fromJSON` to preserve undo stacks:

```ts
let fields = {hist: history.field as EditorState.Field<any>}
let json = state.toJSON(fields)
let restored = EditorState.fromJSON(json, [/* schema… */, history()], fields)
```

## Main public API

### Extension

| Export | Description |
|--------|-------------|
| `history(config?)` | Install history field + config facet |
| `HistoryConfig` | `{minDepth?, newGroupDelay?, joinToEvent?}` |

**Defaults:** `minDepth: 100`, `newGroupDelay: 500`, `joinToEvent: (_tr, isAdjacent) => isAdjacent`.

Combined config uses max `minDepth`, min `newGroupDelay`, and OR of `joinToEvent` predicates.

### Namespace `history`

| Member | Description |
|--------|-------------|
| `history.field` | State field for JSON serialization |
| `history.isolate` | Annotation: `"before"` \| `"after"` \| `"full"` |
| `history.invertedEffects` | Facet: `(tr) => readonly Effect[]` to store inverted |
| `history.EventJSON` / `history.JSON` | JSON shapes for events / full history |

### Commands

| Export | Description |
|--------|-------------|
| `undo` | Pop one group from the done branch |
| `redo` | Pop one group from the undone branch |
| `undoDepth(state)` | Count of undoable groups |
| `redoDepth(state)` | Count of redoable groups |
| `HistoryCommand` | Type: `(cx: {state}) => Transaction.Spec \| false` |

```ts
import {history, undo} from "@arrisa/history"
import {Transaction} from "@arrisa/state"

// Force a boundary after a programmatic edit
editor.dispatch({
  changes: {from: 1, to: 1, insert: /* … */},
  annotations: history.isolate.of("full"),
})

// Edit without polluting undo
editor.dispatch({
  changes: remoteChanges,
  annotations: Transaction.addToHistory.of(false),
})
```

## Layering / related packages

| Package | Role |
|---------|------|
| `@arrisa/doc` | Changes / document model |
| `@arrisa/state` | Fields, transactions, `addToHistory` |
| `@arrisa/command` | Stub `undo`/`redo` identities + menus; wire with `Command.handler` |
| `@arrisa/editor` | View dispatch; default keymap binds Mod-z/y to command stubs |

**Layer:** depends only on doc + state (layer 2). Does not depend on command or editor.

## License

MIT
