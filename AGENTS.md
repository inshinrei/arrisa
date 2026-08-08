# AGENTS.md

> Guidelines for AI coding agents and contributors working **in this repository**.

This file is **not** published to npm. Consumer-facing agent guidance lives in each package’s `agents-for-module.md` and is copied to `dist/AGENTS.md` on build (same pattern as [halua](https://github.com/inshinrei/halua)).

## Code style

- Prefer `let` over `const` in almost all cases inside functions and blocks.
- Use `const` **only** for:
  - Arrow functions (`const foo = () => {}`)
  - True module-top-level / global constants that are never reassigned

```ts
let count = 0
let editor = Arrisa.create({parent, config})

const formatRange = (from: number, to: number) => `${from}…${to}`

let result = compute()
```

- Keep code minimal; no unnecessary abstractions.
- Prefer readability and debuggability over cleverness.

## Logging (when used)

If application or tool code in this monorepo uses [halua](https://github.com/inshinrei/halua):

- Route logs through halua (`.info`, `.warn`, `.error`, …), not raw `console.*` for app logs.
- Use `.error(err)` **only** when the argument is an `Error` instance (or subclass). For plain messages use another level or a string that the logger normalizes.

## Monorepo layout

```
packages/
  doc/        # foundation: document model
  state/      # EditorState, transactions (depends on doc)
  types/      # standard schema elements (depends on doc)
  phrases/    # UI phrase catalogs (depends on state)
  command/    # commands + menu (doc, state, types, phrases)
  history/    # undo/redo (doc, state)
  editor/     # view layer (doc, state, command, phrases)
  schema/     # ready-made extensions (types + editor stack)
  table/      # tables (editor stack + types)
  message/    # messenger compose (schema + editor stack)
  collab/     # OT collab (doc, state)
playground/   # private demo
tooling/      # shared vite lib helper (arrisaLib)
```

**Dependency layering is acyclic.** Do not introduce reverse imports (e.g. `doc` must not import `editor`).

| Layer | Packages |
|-------|----------|
| 0 | `doc` |
| 1 | `state`, `types` |
| 2 | `phrases`, `history`, `command`, `collab` |
| 3 | `editor` |
| 4 | `schema`, `table`, `message` |

## Commands

From the repo root:

| Command | Purpose |
|---------|---------|
| `pnpm build` | Build all packages (`packages/*`) |
| `pnpm test` | Run package unit tests |
| `pnpm typecheck` | `tsc -b` project references |
| `pnpm clean` | Remove package `dist/` dirs |
| `pnpm playground` | Start the playground Vite app |

Per package (from `packages/<name>` or via filter):

- `pnpm --filter @arrisa/<name> build`
- `pnpm --filter @arrisa/<name> test`
- `pnpm --filter @arrisa/<name> typecheck`

Always run relevant tests before committing behavior changes. Run `pnpm build` when validating the published shape (`dist/`, including shipped `AGENTS.md`).

## Testing

- Unit tests live next to source as `*.unit.ts` (Vitest).
- Add or update tests for behavior changes in the same package.
- Prefer pure state/doc tests over full DOM when possible; use editor tests when the view layer is involved.

## Documentation policy

| File | Audience | Published? |
|------|----------|------------|
| Root `README.md` | Humans (repo overview) | GitHub only |
| Root `AGENTS.md` (this file) | Agents in this repo | **No** |
| `packages/*/README.md` | Humans (npm package page) | **Yes** |
| `packages/*/agents-for-module.md` | Agents in consumer apps | **Yes** → `dist/AGENTS.md` on build |

Rules:

1. When changing **public API** or recommended usage, update that package’s `README.md` **and** `agents-for-module.md` in the same PR.
2. Do not invent exports — document only what `src/index.ts` re-exports.
3. Package `agents-for-module.md` must stay consumer-safe (no monorepo release process, no internal tooling paths).
4. Root `AGENTS.md` may describe monorepo workflow, layering, and contributor conventions.
5. Security-sensitive defaults (HTML paste, collab remote effects, URL policies) must stay aligned with [`SECURITY.md`](SECURITY.md).

### Shipping `AGENTS.md` to npm

`tooling/vite-lib.ts` registers a Vite plugin that copies `agents-for-module.md` → `dist/AGENTS.md` on every library build. Packages use:

```ts
import {arrisaLib} from "../../tooling/vite-lib"
export default arrisaLib(import.meta.dirname)
```

After `pnpm build`, each published package contains `dist/AGENTS.md` for agents inspecting `node_modules/@arrisa/<pkg>`.

## Architecture notes (expert mode)

- **`@arrisa/doc`**: immutable document tree (`Node`, `Leaf`, `Plot`), `Schema`, `ChangeSet`, HTML I/O. Foundation for everything else.
- **`@arrisa/state`**: `EditorState` + `Transaction` + selection; extensions/facets compose behavior without mutating core types.
- **`@arrisa/editor`**: view owns DOM; state remains pure. Prefer commands that return `Transaction.Spec` (or `false`) for testability.
- **`@arrisa/types` vs `@arrisa/schema`**: `types` = schema *elements*; `schema` = full editor chrome (menus, keymaps, input rules) built on those elements.
- **`@arrisa/collab`**: single inflight send pipeline (`nextUpdate` / `openUpdate`); **remote effects are dropped by default** unless `filterRemoteEffects` allowlists them.
- **Security**: schema validation is not an XSS boundary. Untrusted HTML requires app-supplied sanitization (`Arrisa.htmlSanitize` / `sanitizeHTML`). See `SECURITY.md`.

## Package work checklist

When editing a package:

1. Read that package’s `README.md` and `agents-for-module.md` (if present) plus `src/index.ts`.
2. Keep the dependency graph acyclic.
3. Update docs if the public surface or usage patterns change.
4. Run package tests; run build if you need to verify `dist/AGENTS.md` copy.

## Decision guidance

- Prefer extending via `EditorState` extensions / facets over hard-wiring into core classes.
- Prefer pure command functions over view-only side effects when both are possible.
- Do not add reverse-layer dependencies “for convenience.”
- Do not treat default collab or paste behavior as fully secure without reading `SECURITY.md`.

---

Follow these rules strictly. When in doubt, ask before violating layering, security defaults, or the documentation split (contributor vs consumer agents files).
