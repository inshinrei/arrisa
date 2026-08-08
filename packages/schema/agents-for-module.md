# AGENTS.md

> Guidelines for AI coding agents working in projects that depend on `@arrisa/schema` (when installed from npm).
>
> This lightweight guide is copied to `dist/AGENTS.md` during build and ships inside the published package.

## When to use

- You need a **document or inline editor** with standard blocks/marks and UI chrome (menus, keys, input rules).
- Prefer a **preset** (`basicSchema`, `fullSchema`, `inlineSchema`, `messengerSchema`) unless the host needs a custom subset of factories.
- For **chat compose** (markdown shortcuts, floating toolbar, entity I/O), use `@arrisa/message`’s `messengerCompose` — it builds on this package’s messenger marks.

## Public API patterns

```ts
import {Arrisa, menuBar} from "@arrisa/editor"
import {basicSchema, fullSchema, paragraph, strong} from "@arrisa/schema"
import {history} from "@arrisa/history"

// Preset
let editor = Arrisa.create({
    parent,
    config: [basicSchema(), history(), menuBar()],
})

// Or compose factories
let config = [/* blockDoc(), paragraph(), strong(), … */]

// Re-rank / omit chrome via namespaces
// paragraph.button, strong.keyBinding, link.tooltip, image.dropHandler, …
```

| Export group | Examples |
|--------------|----------|
| Presets | `basicSchema`, `fullSchema`, `inlineSchema`, `messengerSchema` |
| Mark bundles | `basicMarks`, `messengerMarks`, `inlineMarks` |
| Blocks | `blockDoc`, `inlineDoc`, `paragraph`, `heading`, `codeBlock`, `blockquote`, `horizontalRule`, `alignment`, `direction`, `lineBreak` |
| Lists | `bulletList`, `orderedList` (`{blockItems?: boolean}`) |
| Marks | `strong`, `emphasis`, `code`, `underline`, `strikethrough`, `spoiler`, `superscript`, `subscript` |
| Link / color | `link`, `isLinkPasteUrl`, `color`, `backgroundColor`, `ColorPicker` |
| Media | `image`, `figure`, `imageResizing`, `imageUploader`, `activeImage`, `insertImage`, `imageDialog` |

Factories return `EditorState.Extension` values. Pass them in `EditorState.create` / `Arrisa.create` `config`.

## Invariants / pitfalls

1. **Not `@arrisa/doc`’s Schema class** — this package wires *types from `@arrisa/types`* into editor extensions. Do not invent a parallel schema API here.
2. **Namespaces are partial install hooks** — e.g. `strong()` includes type + button + key; hosts can install `EditorState.schemaElement.of(Strong)` + only `strong.button` if needed.
3. **`messengerSchema` is lean** — inline doc + messenger marks only. No headings, lists, or colors. Use `fullSchema` for documents; use `@arrisa/message` for chat I/O.
4. **`messengerSchema({exclusivity})`** — `"none"` (default free stacking), `"code-strike"` (isolates Code + Strikethrough), or custom `{isolating: Mark.Type[]}`.
5. **Lists** — both `bulletList` and `orderedList` register a list-item type; default is block items. Use `{blockItems: false}` for inline-only items.
6. **Images** — drop/file upload only runs when `imageUploader` facet is provided. Src values go through `sanitizeImageSrc`.
7. **Links** — paste-as-link requires non-empty selection + `isLinkPasteUrl` (absolute safe href). Tooltip never turns unsafe legacy hrefs into clickable script URLs.
8. **Colors** — menu applies only `isSafeCssColor` values; empty string clears the mark.
9. **Prefer `let` in examples** — `const` only for arrow functions or true module-level constants (Arrisa monorepo style).

## What not to do

- Do **not** import reverse-layer packages into a custom fork of this API from low-level packages.
- Do **not** treat schema registration as XSS protection — sanitize untrusted HTML at the app boundary.
- Do **not** document or call non-exported internal modules (`image-shared` internals, etc.) — use the package index re-exports.
- Do **not** add table types here; use `@arrisa/table` + `@arrisa/types` table elements.
- Do **not** skip `@arrisa/history` when the host needs undo; presets do not include history.

## Related packages

| Package | Use when |
|---------|----------|
| `@arrisa/types` | Element definitions only (no menus/keys) |
| `@arrisa/editor` | View, menu bar, input rules runtime |
| `@arrisa/command` | Pure commands / menu model |
| `@arrisa/message` | Messenger compose + FormattedText I/O |
| `@arrisa/table` | Table editing chrome |
| `@arrisa/collab` | OT multiplayer |

## When in doubt

- Read this package’s `README.md` and TypeScript types from `dist/index.d.ts`.
- Match playground usage: document mode ≈ `basicSchema` + extra blocks; chat ≈ `@arrisa/message`.
- Security defaults: [SECURITY.md](https://github.com/inshinrei/arrisa/blob/main/SECURITY.md).

## Keep in sync

When changing public exports or recommended usage, update this file and `README.md` in the same change. Only document what `src/index.ts` re-exports.
