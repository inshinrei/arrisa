# Compose field — design

**Date:** 2026-09-05
**Status:** Accepted
**Scope:** Block chat-compose preset, toolbar placement, link prompt hook, clear-formatting, list FormattedText I/O, compose input profile.

No new published package. Compose is a **profile** assembled from existing packages. `messengerCompose` / `messengerSchema` stay as the inline (optional code-block) messenger path.

Do not name host products in public docs, comments, or tests.

## Goal

A host can mount a short **block** compose field whose schema is exactly:

- Marks: strong, emphasis, underline, strikethrough, inline code, link
- Blocks: paragraph, bullet list, ordered list, blockquote, code block
- Line break

Default chrome is a **floating** selection toolbar (same `Menu.Item`s as a document editor, compose subset). Hosts may instead (or also) mount that menu into a parent node and supply CSS. Link **add** is a floating prompt by default; hosts may replace the prompt with their own UI and call `apply`. Clear-formatting is a toolbar action. Typing uses a reduced keymap. FormattedText round-trips lists.

## Non-goals

- New npm package (`@arrisa/compose` or editor-core split)
- Changing `messengerCompose` defaults (still InlineDoc + spoiler + optional `codeBlocks`)
- Nested-list import beyond one wrapping level if the walker cannot do it cheaply (export still emits one entity per list container)
- Markdown-paste list parsing (`- ` / `1. ` typing already comes from list input rules)
- Tile virtualization, scrolling compose, headings, images, colors, HR, alignment, spoiler in this preset
- Mentions / custom emoji in the preset (still optional via existing `messengerHostElements` on the host config)

## Architecture

```
@arrisa/command     clearFormatting, applyLink, removeLinks, replaceDoc
@arrisa/phrases     clear_formatting
@arrisa/schema      composeMarks, composeSchema, link({prompt})
@arrisa/editor      composeKeymap, embeddedMenu, floating link prompt view
@arrisa/message     composeField, list entities in FormattedText I/O
```

Hosts:

```ts
import {Arrisa} from "@arrisa/editor"
import {history} from "@arrisa/history"
import {composeField, docToFormattedText, formattedTextToDoc} from "@arrisa/message"

let editor = Arrisa.create({
    parent: mount,
    config: [composeField(), history()],
})

let payload = docToFormattedText(editor.state.doc, {autoDetect: true})
```

Embedded toolbar + custom link UI:

```ts
composeField({
    floating: false,
    embedded: {parent: toolbarEl, theme: false, class: "host-compose-tools"},
    linkPrompt: (ctx) => {
        hostOpenLinkField({
            href: ctx.href,
            onSubmit: (url) => ctx.apply(url),
            onCancel: ctx.cancel,
        })
    },
})
```

## Schema

`composeMarks(config?)` registers: `strong()`, `emphasis()`, `underline()`, `strikethrough()`, `code()`, `link(config?.link)`, plus the clear-formatting menu button.

`composeSchema(config?)`:

- `blockDoc()`, `paragraph()`, `lineBreak()`
- `composeMarks({link: config?.link})`
- `bulletList()`, `orderedList()`, `blockquote()`, `codeBlock()`
- Optional `exclusivity` same as `messengerSchema` (`"none"` default, `"code-strike"`, or `{isolating}`)

Does **not** register: InlineDoc, Spoiler, Heading, Image, Color, HR, Alignment, Direction, Figure.

List items stay the factory default (block `ListItem`).

## Commands

### `clearFormatting`

Pure. Drops **marks** in the selection (including Link). Does **not** unwrap lists, quotes, or code blocks.

- Empty text cursor: if stored/active marks are non-empty, set stored marks to empty (`userEvent: "mark.remove"`). Else `false`.
- Non-empty ranges: iterate covered nodes; for each mark on the node emit `{from, to, remove: mark}`. If none, `false`.

### `applyLink(href)`

Pure. `sanitizeLinkHref(href)`; if null or selection empty, `false`. Else add `Link.of(safe)` across selection ranges (`userEvent: "mark.add"`).

### `removeLinks`

Pure. Same iteration as today’s toggle-link remove path. `false` when no link marks in the selection.

### `replaceDoc(doc)`

Pure helper returning a spec that replaces `0..state.doc.length` with `doc.content`, maps selection to a cursor near the start of the new doc (or a provided selection), `userEvent: "set.doc"`, `Transaction.addToHistory.of(false)`. Same schema assumed.

## Link prompt

Today Mod-k / the link button opens a **top `Dialog` panel**. That default is replaced.

`link(config?: LinkConfig)`:

```ts
type LinkPromptRequest = {
    editor: Arrisa
    from: number
    to: number
    href?: string
    apply: (href: string) => void
    cancel: () => void
}
type LinkPrompt = (req: LinkPromptRequest) => void

interface LinkConfig {
    /** Default `"floating"`. `false` = no prompt (remove-only). Function = host UI. */
    prompt?: "floating" | false | LinkPrompt
}
```

Toggle command (view):

1. If the floating prompt or dialog is already open for this editor, close it and return true (keep today’s close-if-open).
2. Empty selection → `false`.
3. If the selection contains any Link mark → `removeLinks`.
4. If `prompt === false` → `false`.
5. Else call the resolved prompt with `{from, to, href, apply, cancel}`. `href` is the existing sanitized href when the selection sits inside a single link; otherwise omitted. `apply` runs `applyLink` (sanitizes again) and closes the prompt. `cancel` closes without changes.

**Default `"floating"`:** a tooltip form anchored on the selection (`input[name=url]` + submit), phrases `link_target` / `create_link`. Escape cancels. Autofocus the input. Not a `Dialog` panel. Cursor-inside-link URL tooltip (read-only) stays as today.

Paste-as-link unchanged (`isLinkPasteUrl` + `applyLink` behavior).

`composeSchema` / `composeField` pass `linkPrompt` through to `link({prompt})`. Document hosts that call `link()` with no config also get the floating prompt (intentional default change).

## Toolbars

Items come from `Menu.Item` extensions already registered by the schema factories (inline marks, link, lists, quote, code-block / textblock-style submenu) plus clear-formatting.

**Floating (default):** `floatingMenu` with template `Menu.Group.top.template()` so inline + block + textblock-style items appear. `theme` / `class` / `createDOM` remain overridable via `FloatingMenuConfig`. `composeField({floating: false})` omits it.

**Embedded:** new `embeddedMenu(config)` in `@arrisa/editor`.

```ts
interface EmbeddedMenuConfig {
    parent: HTMLElement | (() => HTMLElement)
    template?: Menu.Template | readonly Menu.Template[]
    class?: string
    createDOM?: () => HTMLElement
    theme?: boolean | EditorState.Extension
}
```

An `Arrisa.Plugin` creates a `MenuHost` (`variant: "bar"`), appends `host.dom` to `parent` on `connect`, `host.update` on editor updates, removes the node on `disconnect`/`remove`. Default template: `Menu.Group.top.template()`. Default theme: compact row using existing `--arrisa-menu-*` variables, **no** bottom border (that is the document menu bar). `theme: false` = host CSS only.

Floating and embedded are independent. A host may enable both.

Clear-formatting button: `Menu.Group.inline`, rank `90` (after link `50`), phrase `clear_formatting`, icon button. Exported as `clearFormattingButton` from schema for hosts that want it without `composeSchema`.

## Compose input profile

`composeKeymap()`:

- `KeyBinding.useDefaultKeymap.of(false)`
- Bindings kept: Enter, Shift-Enter, Backspace, Delete, word-delete, arrows, word-arrows, Home/End, Mod-a, Mod-z, Mod-y / Mac Mod-Shift-z / Linux Ctrl-Shift-z
- Bindings **not** installed: PageUp/PageDown, transpose, macOS emacs (Ctrl-b/f/p/n/a/e/d/h/k/t/o/v, Ctrl-Alt-h)

Mark/list shortcuts stay on the schema factories (Mod-b, `- `, `> `, fence + space, …).

No `Arrisa.scrolling` in `composeField`. Placeholder default `"Message…"`. History is **not** included.

## FormattedText lists

New entities (UTF-16 offsets, same as `pre` / `blockquote`):

```ts
type UnorderedListEntity = {type: "unordered_list"; offset: number; length: number}
type OrderedListEntity = {type: "ordered_list"; offset: number; length: number; startIndex?: number}
```

`startIndex` omitted when `1`.

`isStructuralEntity` includes both. Auto-detect does **not** treat lists as exclusive (same as blockquote).

**Export:** walking a `BulletList` / `OrderedList` opens/closes a structure frame. Entity covers the flattened item text (block separator between items). Ordered param forwarded as `startIndex` when not 1.

**Import:** extend the block cut-set. Consecutive segments that share the same list range wrap as `BulletList`/`OrderedList` of `ListItem`s (each item a paragraph or a code block if that segment is `pre`). Wrap **lists before quotes** so a quote range covering a whole list becomes `Blockquote > List`. One-level lists are required. Nested lists: if an inner list range is fully contained in an item, wrap it inside that item; if that is not reliable in one pass, document one-level-only and add a follow-up — do not ship a wrong nested tree.

Constructors: `unorderedListEntity`, `orderedListEntity`.

## `composeField`

`@arrisa/message`:

```ts
interface ComposeFieldConfig {
    exclusivity?: "none" | "code-strike" | {isolating: readonly Mark.Type[]}
    floating?: boolean | FloatingMenuConfig  // default true
    embedded?: false | EmbeddedMenuConfig    // default false
    placeholder?: string | false             // default "Message…"
    markdown?: boolean                       // default true
    markdownPaste?: boolean                  // default true
    hostElements?: boolean                   // default false
    resolveMention?: (username: string) => string | null | undefined
    linkPrompt?: LinkConfig["prompt"]
}
```

Installs: `composeSchema`, `composeKeymap`, optional host elements / mention resolve, markdown rules/paste, floating and/or embedded menu, placeholder.

`hostElements` defaults **false** (lean). `messengerCompose` keeps `hostElements: true`.

## Performance

Compose profile work in this change is **keymap + no scrolling + replaceDoc without history**. Do not add a second tile pipeline. IME/`beforeinput` work already in flight on the editor stays; this spec does not reopen it.

## Testing

Unit tests (`*.unit.ts`) in the package that owns the export.

- Command: clear empty/range; applyLink sanitizes and rejects empty selection; removeLinks; replaceDoc does not record history annotation
- Schema: `composeSchema` type set (has lists/quote/code/marks; no spoiler/heading/image); `link({prompt})` custom callback receives apply/cancel; `prompt: false` does not add
- Message: list export/import round-trip; ordered `startIndex`; list inside blockquote; `composeField` schema + default keymap off
- Editor: `composeKeymap` disables default map and omits PageDown; `embeddedMenu` registers a plugin and honors `theme: false`

## Docs

Update each touched package’s `README.md` **and** `agents-for-module.md` in the same change as the export. Consumer-safe; no host-product names; only `src/index.ts` re-exports.

Playground chat mode may switch to `composeField` (block lists/quote) or keep `messengerCompose` — prefer adding a compose playground path without removing messenger mode.

## Security

`applyLink` and paste-as-link still go through `sanitizeLinkHref`. Custom `linkPrompt` must call `ctx.apply` (not raw `Link.of`) so unsafe hrefs cannot skip sanitization. Schema validation is not an XSS boundary.
