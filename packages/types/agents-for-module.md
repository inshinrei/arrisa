# AGENTS.md

> Guidelines for AI coding agents working in projects that depend on `@arrisa/types` (when installed from npm).
>
> This lightweight guide is copied to `dist/AGENTS.md` during build and ships inside the published package.

## When to use this package

Use `@arrisa/types` for standard document schema elements and small safety helpers:

- Assemble a `Schema` from `Paragraph`, `Heading`, `Strong`, `Link`, tables, images, …
- Prefer these over redefining common HTML-ish nodes
- Validate link/image URLs and CSS colors with the shared helpers

This package is **elements only** (layer 1 on `@arrisa/doc`). For menus/keymaps/input rules use `@arrisa/schema` (or `@arrisa/message` / `@arrisa/table` for specialized surfaces).

## Public API & common patterns

### Exports

```ts
import {
    // blocks / lists / docs
    Paragraph,
    Heading,
    CodeBlock,
    CodeBlockLanguage,
    Blockquote,
    ListItem,
    InlineListItem,
    OrderedList,
    BulletList,
    HorizontalRule,
    Alignment,
    Direction,
    Doc,
    InlineDoc,
    // marks / inline
    LineBreak,
    Emphasis,
    Strong,
    Underline,
    Strikethrough,
    Spoiler,
    Superscript,
    Subscript,
    Link,
    Code,
    Color,
    BackgroundColor,
    // media
    Image,
    Figure,
    CaptionedFigure,
    ImageAlt,
    ImageSize,
    // table
    Cell,
    HeaderCell,
    BlockCell,
    BlockHeaderCell,
    TableRow,
    Table,
    ColSpan,
    RowSpan,
    // safety
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

### Build a schema

```ts
import {Schema, Leaf} from "@arrisa/doc"
import {Doc, Paragraph, Strong, Link, LineBreak} from "@arrisa/types"

let schema = Schema.define([Doc, Paragraph, Strong, Link, LineBreak])
let doc = schema.doc([Paragraph.create([Leaf.text("Hi", [Strong])])])
```

Include every type you will use. Missing types break JSON/HTML round-trips and `ChangeSet` that insert those tags.

### Flag marks vs param marks

```ts
// Flag-style (Mark.define): use the default instance
Leaf.text("x", [Strong, Emphasis])

// Param marks (Mark.Type.define): use .of(value)
Link.of("https://example.com")
Heading.of(2).create([Leaf.text("Title")])
Color.of("rebeccapurple")
Image.of("https://cdn.example/a.png")
```

### Safe URLs and colors

```ts
let href = sanitizeLinkHref(userInput)
if (href == null) {
    // drop link / show error — do not call Link.of with unsafe strings
} else {
    Link.of(href)
}

let src = sanitizeImageSrc(userSrc, {allowDataImage: false})
let color = sanitizeCssColor(userColor)
```

Default link schemes: `http:`, `https:`, `mailto:`, `xmpp:` (+ relative).  
Default image schemes: `http:`, `https:`, `blob:` (+ relative).  
`javascript:`, generic `data:`, and control characters are rejected.

### Dual-shaped types (same schema name)

| Pair | Shared name | Choose based on |
|------|-------------|-----------------|
| `ListItem` / `InlineListItem` | `"ListItem"` | Block vs inline item body |
| `Cell` / `BlockCell` | `"Cell"` | Inline vs block cell content |
| `HeaderCell` / `BlockHeaderCell` | `"HeaderCell"` | Same |

**Do not put both variants of a pair in the same `Schema.define` list** — names must be unique. Pick one shape per schema.

`Doc` vs `InlineDoc`: only one document type per schema.

## Invariants / pitfalls

1. **Elements are shared singletons** — import from `@arrisa/types`; do not redefine `"Paragraph"` with the same name in a second schema element if you need interop.
2. **Validation throws** — bad heading levels, unsafe `Link`/`Image` params, invalid colors throw `ValidationError` (or `RangeError` for spans).
3. **Link is non-inclusive** — typing at the end of a link does not extend the mark (by design).
4. **Color marks are spanning** — mark mods apply across structure where allowed.
5. **Safety helpers are pure string checks** — no DOM base URL resolution; protocol-relative `//…` is rejected for “relative” paths.
6. **Not a full CSS sanitizer** — only color values for the color marks; arbitrary `style` bags are out of scope.

## What not to do

- Do not invent node names that are not exported (e.g. inventing `Bold` when the export is `Strong`).
- Do not skip `sanitizeLinkHref` / `sanitizeImageSrc` for user-supplied URLs even if you “know” the UI is internal.
- Do not treat including these types as paste XSS protection — still sanitize HTML at the app boundary.
- Do not mix `ListItem` with `InlineListItem` (or cell duals) in one schema.
- Do not implement editor UI here; use `@arrisa/schema` / `@arrisa/editor`.

## Related packages

| Package | Use when |
|---------|----------|
| `@arrisa/doc` | `Schema`, `ChangeSet`, custom element definitions. |
| `@arrisa/schema` | Drop-in basic/full schema extensions + chrome. |
| `@arrisa/table` | Table selection, structure commands, paste. |
| `@arrisa/message` | Chat-style compose + formatted text. |
| `@arrisa/state` | Wire schema via `EditorState.schemaElement`. |

## When in doubt

- [ ] Is the symbol exported from `@arrisa/types`?
- [ ] Is only one doc root and one list-item/cell shape in the schema?
- [ ] Are user URLs/colors passed through `sanitize*` before mark/node creation?
- [ ] Prefer `@arrisa/schema` presets when the app wants menus/keymaps, not only types.
- [ ] Keep layering: types must not import editor/state.

Read the package `README.md` for export tables and security defaults.

---

Keep this file in sync with `README.md` when the public API or recommended usage patterns change.
