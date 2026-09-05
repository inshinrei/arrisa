# Arrisa

**A modular rich-text editor toolkit for the web** — document model, editor state, view, commands, schema presets, tables, messenger compose, and collaborative OT.

Arrisa is split into focused packages so you can compose only what you need: a full document editor, a chat-style composer, or just the core document model.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Packages

| Package | Description |
|---------|-------------|
| [`@arrisa/doc`](packages/doc) | Document model, schema, changes, HTML parse/serialize |
| [`@arrisa/state`](packages/state) | Editor state, selection, transactions, bidi, corrections |
| [`@arrisa/types`](packages/types) | Standard node/mark definitions and URL/color safety helpers |
| [`@arrisa/phrases`](packages/phrases) | Typed UI phrase catalogs and locale overrides |
| [`@arrisa/command`](packages/command) | Editing commands, menu model, structure/mark/motion helpers |
| [`@arrisa/history`](packages/history) | Undo/redo history field and commands |
| [`@arrisa/editor`](packages/editor) | View layer: DOM rendering, input, decorations, UI chrome |
| [`@arrisa/schema`](packages/schema) | Ready-made schema extensions (menus, keymaps, input rules) |
| [`@arrisa/table`](packages/table) | Table editing: cell selection, structure, paste, menu |
| [`@arrisa/message`](packages/message) | Messenger compose, formatted text / entities, markdown |
| [`@arrisa/collab`](packages/collab) | Collaborative editing (OT pipeline + corrections) |

Layering (acyclic):

```
doc → state / types
      state → phrases / history / command / collab
      types → command / schema / table / message
      command + state → editor
      editor + types → schema / table / message
```

## Installation

Packages are published under the `@arrisa` scope. Install the pieces you need:

```bash
pnpm add @arrisa/editor @arrisa/schema @arrisa/history @arrisa/state @arrisa/doc
# or npm / yarn
```

## Quick start

Minimal document editor with a basic schema and undo/redo:

```ts
import {Arrisa, menuBar} from "@arrisa/editor"
import {basicSchema} from "@arrisa/schema"
import {history, undo, redo} from "@arrisa/history"
import {Command, undo as cmdUndo, redo as cmdRedo} from "@arrisa/command"

let parent = document.getElementById("editor")!

let editor = Arrisa.create({
    parent,
    config: [
        basicSchema(),
        history(),
        Command.handler(cmdUndo, (ed) => undo({state: ed.state})),
        Command.handler(cmdRedo, (ed) => redo({state: ed.state})),
        menuBar(),
    ],
})

editor.focus()
```

Messenger-style compose (inline marks, floating menu, markdown shortcuts):

```ts
import {Arrisa} from "@arrisa/editor"
import {history} from "@arrisa/history"
import {messengerCompose} from "@arrisa/message"
import {docToFormattedText} from "@arrisa/message"

let editor = Arrisa.create({
    parent,
    config: [messengerCompose(), history()],
})

// On send:
let payload = docToFormattedText(editor.state.doc, {autoDetect: true})
```

See the [playground](playground/) for a full dual-mode (document + chat) demo.

## Security

Arrisa validates document structure and applies default policies on URLs, colors, attributes, and collab effects — but it is **not** a full HTML sanitizer. Apps that accept untrusted content must configure sanitization and related controls.

See **[SECURITY.md](SECURITY.md)** before shipping paste, HTML load, or multi-user editing.

## Monorepo development

```bash
pnpm install
pnpm build          # build all packages
pnpm test           # unit tests (Vitest)
pnpm typecheck      # project references
pnpm playground     # local demo app
```

| Path | Purpose |
|------|---------|
| `packages/*` | Publishable libraries |
| `playground/` | Manual QA / demo (private, not published) |
| `tooling/` | Shared Vite lib config |
| `docs/` | Extra documentation |

Each package ships a human `README.md` and, after build, `dist/AGENTS.md` (consumer-oriented guidance for coding agents). Repo-level contributor guidance lives in root [`AGENTS.md`](AGENTS.md) and is **not** published.

## Release

Published `packages/*` share one lockstep version with the repo root `package.json`. Private packages (the playground) are skipped.

```bash
pnpm version:sync                    # copy root version onto published packages
pnpm version:bump patch|minor|major  # standard semver on root, then sync
pnpm release:prepare                 # test, typecheck, build, then version:sync
pnpm release:publish                 # publish every public package under packages/*
pnpm release                         # prepare, then publish
pnpm release:publish -- --dry-run    # extra flags are passed to pnpm publish
pnpm test:scripts                    # version/publish-script unit tests
```

`release:prepare` does not publish. `release:publish` runs `pnpm -r --filter './packages/*' publish` (skips the private playground; skips versions already on the registry). Extra flags after `--` go to `pnpm publish`. Bumps use standard semver (`0.1.0` + patch → `0.1.1`, + minor → `0.2.0`, + major → `1.0.0`).

## License

MIT © [inshinrei](https://github.com/inshinrei)
