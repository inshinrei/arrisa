# @arrisa/schema

**Ready-made Arrisa editor schema extensions** — document roots, blocks, lists, marks, links, colors, and images wired with menus, keymaps, and input rules on top of `@arrisa/types`.

This package is **editor chrome**, not the low-level `Schema` class (that lives in `@arrisa/doc`). Node/mark *types* come from `@arrisa/types`; factories here register those types and attach UI behavior.

## Install

```bash
pnpm add @arrisa/schema @arrisa/editor @arrisa/state @arrisa/doc
# or npm / yarn
```

Peer-style stack used by the factories: `@arrisa/command`, `@arrisa/history`, `@arrisa/phrases`, `@arrisa/types` (installed as package dependencies).

## Quick start

Document editor with a lightweight preset:

```ts
import {Arrisa, menuBar} from "@arrisa/editor"
import {basicSchema} from "@arrisa/schema"
import {history} from "@arrisa/history"

let parent = document.getElementById("editor")!

let editor = Arrisa.create({
    parent,
    config: [basicSchema(), history(), menuBar()],
})

editor.focus()
```

Full rich-text (blocks, lists, marks, media, resize):

```ts
import {fullSchema} from "@arrisa/schema"

let editor = Arrisa.create({
    parent,
    config: [fullSchema(), history(), menuBar()],
})
```

Compose factories instead of a preset:

```ts
import {
    blockDoc,
    paragraph,
    heading,
    bulletList,
    strong,
    emphasis,
    link,
} from "@arrisa/schema"

let config = [
    blockDoc(),
    paragraph(),
    heading(),
    bulletList(),
    strong(),
    emphasis(),
    link(),
]
```

## Features / concepts

| Concept | Role |
|---------|------|
| **Presets** | `basicSchema`, `fullSchema`, `inlineSchema`, `messengerSchema` assemble extensions for common hosts |
| **Factories** | `paragraph()`, `strong()`, `image()`, … each returns an `EditorState.Extension` (or array) |
| **Namespaces** | Merged namespaces expose pieces for re-ranking/omission: `paragraph.button`, `link.tooltip`, `image.dropHandler`, … |
| **Types vs chrome** | Schema elements from `@arrisa/types`; this package adds menu, keys, input rules, dialogs, themes |

### Presets

| Preset | Typical use |
|--------|-------------|
| `basicSchema()` | Block `Doc`, paragraphs, headings, line breaks, strong/em/link |
| `inlineSchema()` | `InlineDoc`, basic marks, inline images, line breaks |
| `messengerSchema(config?)` | Chat-style: `InlineDoc` + messenger marks; optional mark exclusivity |
| `fullSchema()` | Blocks, lists, quotes, HR, full inline marks, image/figure, image resize |

Mark bundles (usable alone or inside presets):

- `basicMarks()` — strong, emphasis, link
- `messengerMarks()` — spoiler, strong, em, underline, strike, code, link
- `inlineMarks()` — basic + code, underline, strike, spoiler, super/sub, text/background color

### Input rules (selection)

- Headings: `# ` … `###### `
- Code block: `` ``` ``
- Blockquote: `> `
- Horizontal rule: `---` on an empty textblock
- Bullet list: optional space + `- `
- Ordered list: optional space + `N. `

### Shortcuts (selection)

| Binding | Action |
|---------|--------|
| Mod-b / Mod-i / Mod-u / Mod-/ / Mod-` | Strong / em / underline / strike / code |
| Mod-Shift-p | Spoiler |
| Mod-. / Mod-, | Super / subscript |
| Mod-k | Toggle link (dialog when none selected) |
| Ctrl-Shift-0…6 | Paragraph / heading levels |
| Ctrl-Shift-\\ | Code block |
| Mod-Shift-l/r/e | Align left / right / center |
| Ctrl-Alt-i (Mac: Ctrl-Cmd-i) | Insert/update image dialog |

## Main public API

### Document roots and blocks

```ts
import {
    blockDoc,
    inlineDoc,
    paragraph,
    heading,
    codeBlock,
    alignment,
    direction,
    blockquote,
    horizontalRule,
    lineBreak,
} from "@arrisa/schema"
```

- `blockDoc()` / `inlineDoc()` — register `Doc` or `InlineDoc`
- `paragraph()`, `heading()`, `codeBlock()` — textblocks + chrome
- `alignment()`, `direction()` — textblock marks + menu submenus
- `blockquote()`, `horizontalRule()` — structure + input rules
- `lineBreak()` — hard break leaf (`br`)

### Lists

```ts
import {bulletList, orderedList} from "@arrisa/schema"

bulletList()                       // block list items (default)
bulletList({blockItems: false})    // inline-only list items
orderedList()
```

### Marks

```ts
import {
    strong,
    emphasis,
    code,
    underline,
    strikethrough,
    spoiler,
    superscript,
    subscript,
    basicMarks,
    messengerMarks,
    inlineMarks,
} from "@arrisa/schema"
```

### Link

```ts
import {link, isLinkPasteUrl} from "@arrisa/schema"

link() // mark + Mod-k + tooltip + paste-URL-over-selection

if (isLinkPasteUrl(text)) {
    // absolute http(s) / mailto / xmpp, no spaces
}
```

### Color

```ts
import {color, backgroundColor, ColorPicker} from "@arrisa/schema"

color()
backgroundColor()

// Optional palette layout (facets on ColorPicker)
// ColorPicker.options / ColorPicker.width
```

Values must pass `isSafeCssColor` from `@arrisa/types` (defense in depth in the menu control).

### Image / figure

```ts
import {
    image,
    figure,
    imageResizing,
    imageUploader,
    activeImage,
    insertImage,
    imageDialog,
} from "@arrisa/schema"

// Register types + insert chrome
image()
figure({captioned: true})
imageResizing()

// Provide an upload handler for file picker / drop
imageUploader.of(async (file, editor, progress) => {
    progress(50)
    return await uploadToCdn(file)
})
```

- `image()` — inline `Image` + dialog, menu, drop handler
- `figure({captioned?})` — block `Figure`, optionally `CaptionedFigure`
- `imageResizing()` — `ImageSize` mark, drag handle, enlarge/shrink keys
- `insertImage` / `imageDialog` — open/close insert panel
- `activeImage(sel)` — active image/figure tag at selection, if any

### Presets and messenger config

```ts
import {
    basicSchema,
    fullSchema,
    inlineSchema,
    messengerSchema,
    type MessengerSchemaConfig,
} from "@arrisa/schema"

messengerSchema({
    exclusivity: "none", // | "code-strike" | {isolating: Mark.Type[]}
})
```

For a full chat field (markdown, floating menu, mentions), prefer `@arrisa/message`’s `messengerCompose`, which builds on `messengerSchema`.

## Layering / related packages

```
@arrisa/types  →  @arrisa/schema  →  host app
                      ↑
              @arrisa/editor, @arrisa/command, …
```

| Package | Relationship |
|---------|----------------|
| `@arrisa/types` | Schema *elements* (Paragraph, Strong, Link, …) |
| `@arrisa/doc` | Low-level `Schema`, document tree — not this package |
| `@arrisa/editor` | View: menus, input rules, dialogs, themes |
| `@arrisa/command` | Commands (`toggleMark`, `setTextblockType`, …) and menu model |
| `@arrisa/message` | Messenger compose preset on top of schema marks |
| `@arrisa/table` | Table chrome; combine with `fullSchema()` / custom blocks |

## Security

Schema registration is **not** an XSS boundary. Untrusted HTML paste/load needs app sanitization (`Arrisa.htmlSanitize` / `sanitizeHTML`). Link and image helpers reject dangerous schemes (`javascript:`, unsafe `data:`, etc.). See [SECURITY.md](https://github.com/inshinrei/arrisa/blob/main/SECURITY.md).

## License

MIT © [inshinrei](https://github.com/inshinrei)
