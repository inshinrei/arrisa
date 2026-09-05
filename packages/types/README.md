# @arrisa/types

**Standard Arrisa schema nodes, marks, and URL/color safety helpers.**

Ready-made `Plot` / `Leaf` / `Mark` definitions (paragraphs, headings, lists, tables, links, images, colors, …) built on `@arrisa/doc`. Pair with `Schema.define` (or higher packages like `@arrisa/schema`) to assemble a document model.

## Install

```bash
pnpm add @arrisa/types
```

Depends on `@arrisa/doc`.

## Quick start

```ts
import {Schema, Leaf, ChangeSet} from "@arrisa/doc"
import {
    Doc,
    Paragraph,
    Heading,
    Strong,
    Emphasis,
    Link,
    LineBreak,
    sanitizeLinkHref,
} from "@arrisa/types"

let schema = Schema.define([
    Doc,
    Paragraph,
    Heading,
    Strong,
    Emphasis,
    Link,
    LineBreak,
])

let doc = schema.doc([
    Paragraph.create([
        Leaf.text("Hello "),
        Leaf.text("world", [Strong]),
    ]),
    Heading.of(2).create([Leaf.text("Section")]),
])

// Safe link params only
let href = sanitizeLinkHref("https://example.com")
if (href) {
    let withLink = ChangeSet.create(doc, {
        from: 1,
        to: 6,
        add: Link.of(href),
    }).apply(doc)
}
```

## Features / concepts

- **Block content** — paragraphs, headings (levels 1–6), code blocks, blockquotes, horizontal rules.
- **Lists** — bullet/ordered lists with block or inline list items.
- **Tables** — cells (inline or block), rows, table wrapper, col/row span marks.
- **Media** — inline images, figures, captioned figures, alt/size marks.
- **Marks** — emphasis, strong, underline, strike, spoiler, super/sub, link, code, colors, alignment, direction.
- **Docs** — `Doc` (block content) and `InlineDoc` (inline-only root).
- **Safety helpers** — scheme allowlists for links/images; strict CSS color validation for color marks.

These are **schema elements**, not full editor chrome. Menus, keymaps, and input rules live in `@arrisa/schema` / `@arrisa/command` / `@arrisa/editor`.

## Main public API

### Blocks & structure

| Export | Kind | Notes |
|--------|------|--------|
| `Paragraph` | plot | Default block (`defaultBlock`); `p`. |
| `Heading` | plot type | Param level `1`–`6` → `h1`…`h6`. |
| `CodeBlock` | plot | `pre > code`; `Node.Role.Code`; defining. |
| `CodeBlockLanguage` | mark | `class="language-<id>"` on inner `code` (parses `data-language` too). |
| `Blockquote` | plot | Nestable; `autoJoin`. |
| `HorizontalRule` | leaf | Selectable `hr`. |
| `ListItem` / `InlineListItem` | plot | Same type name `"ListItem"`; block vs inline body. |
| `OrderedList` / `BulletList` | plot | `ol`/`ul`; list role; ordered param = start. |
| `Cell` / `HeaderCell` | plot | Inline `td`/`th`. |
| `BlockCell` / `BlockHeaderCell` | plot | Block body; same names as inline cell types. |
| `TableRow` / `Table` | plot | `tr` / `table>tbody`. |
| `ColSpan` / `RowSpan` | mark | Positive integer spans. |

### Inline & media

| Export | Kind | Notes |
|--------|------|--------|
| `LineBreak` | leaf | `br`; `Node.Role.LineBreak`. |
| `Image` | leaf type | Inline `img`; param = safe `src`. |
| `Figure` / `CaptionedFigure` | leaf / plot | Block figures; caption holds inline content. |
| `ImageAlt` / `ImageSize` | mark | Alt text; width in CSS px. |

### Marks & text style

| Export | Notes |
|--------|--------|
| `Emphasis`, `Strong`, `Underline`, `Strikethrough` | Classic wrappers / decorations. |
| `Spoiler` | `span.arrisa-spoiler` (+ parse aliases). |
| `Superscript`, `Subscript` | `sup` / `sub`. |
| `Link` | String href; non-inclusive; validates via `sanitizeLinkHref`. |
| `Code` | Inline `code`. |
| `Color`, `BackgroundColor` | Spanning; CSS color via `sanitizeCssColor`. |
| `Alignment` | `end` \| `center` on textblocks/figures. |
| `Direction` | `ltr` \| `rtl` \| `auto` on textblocks. |

### Document roots

| Export | Notes |
|--------|--------|
| `Doc` | Block `Node.Group.Content` root. |
| `InlineDoc` | Inline-only root (single-line fields, messengers). |

### URL & color safety

```ts
import {
    isSafeLinkHref,
    sanitizeLinkHref,
    isSafeImageSrc,
    sanitizeImageSrc,
    isSafeCssColor,
    sanitizeCssColor,
    type LinkHrefPolicy,
    type ImageSrcPolicy,
} from "@arrisa/types"
```

| Helper | Default policy (high level) |
|--------|-----------------------------|
| `sanitizeLinkHref` | `http:`, `https:`, `mailto:`, `xmpp:`; relative allowed; no `data:`. |
| `sanitizeImageSrc` | `http:`, `https:`, `blob:`; relative allowed; `data:image/*` only if `allowDataImage`. |
| `sanitizeCssColor` | Named colors, hex, `rgb(a)` / `hsl(a)`-style values; rejects `;`, `url(`, etc. |

`sanitize*` returns the value or `null`. `isSafe*` is a boolean wrapper. Link/Image marks and media nodes call these in `validate` / parse paths.

## Layering / related packages

```
@arrisa/doc
  └─ @arrisa/types   ← you are here
       used by @arrisa/schema, @arrisa/table, @arrisa/message, @arrisa/command
```

| Package | Relation |
|---------|----------|
| [`@arrisa/doc`](https://www.npmjs.com/package/@arrisa/doc) | `Schema.define`, `Plot`/`Leaf`/`Mark` primitives. |
| `@arrisa/schema` | Full editor extensions (menus, keymaps) using these elements. |
| `@arrisa/table` | Table editing commands/selection on table types. |
| `@arrisa/message` | Messenger compose schemas / formatted text. |

## Security

- Built-in `Link` / `Image` / color marks reject unsafe schemes and style-injection fragments **for these types**.
- Custom marks/nodes you add without the same checks are **not** covered.
- Schema parse still needs app-level HTML sanitization for untrusted input.

See repository root [`SECURITY.md`](https://github.com/inshinrei/arrisa/blob/main/SECURITY.md).

## License

MIT
