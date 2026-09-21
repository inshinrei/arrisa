# @arrisa/message

**Messenger compose for Arrisa** — chat-style editor presets (`composeField` block field, `messengerCompose` inline/spoiler), markdown shortcuts/paste, host mentions & custom emoji, and **FormattedText** (plain text + UTF-16 offset entities) I/O.

Built on `@arrisa/schema` compose/messenger marks. Layering: schema chrome → this package (wire format + compose).

## Install

```bash
pnpm add @arrisa/message @arrisa/editor @arrisa/schema @arrisa/state @arrisa/doc
# or npm / yarn
```

Add `@arrisa/history` if you need undo/redo (not included in `composeField` / `messengerCompose`).

## Quick start

Block chat field (lists, quotes, fenced code):

```ts
import {Arrisa} from "@arrisa/editor"
import {history} from "@arrisa/history"
import {composeField, docToFormattedText, formattedTextToDoc} from "@arrisa/message"

let editor = Arrisa.create({
    parent: document.getElementById("compose")!,
    config: [composeField(), history()],
})
```

Inline/spoiler messenger field:

```ts
import {Arrisa} from "@arrisa/editor"
import {history} from "@arrisa/history"
import {messengerCompose, docToFormattedText, formattedTextToDoc} from "@arrisa/message"

let editor = Arrisa.create({
    parent: document.getElementById("compose")!,
    config: [
        messengerCompose({
            resolveMention: (username) => userIds[username] ?? null,
        }),
        history(),
    ],
})
```

On send — plain text + entities (UTF-16 offsets):

```ts
let payload = docToFormattedText(editor.state.doc, {autoDetect: true})
// { text: string, entities?: MessageEntity[] }

// Hydrate a draft
let doc = formattedTextToDoc(payload, editor.state.schema)
```

## Features / concepts

### FormattedText

Wire shape used by many chat backends:

```ts
type FormattedText = {
    text: string
    entities?: MessageEntity[]
}
```

- **Offsets and lengths are UTF-16 code units** (JavaScript string indices).
- Entities include flag marks (`bold`, `italic`, …), `text_url`, `pre`, `blockquote`, `unordered_list`, `ordered_list`, `mention_name`, `custom_emoji`, and auto types (`url`, `email`, `hashtag`, …).

### Compose presets

`composeField(config?)` installs a **block** chat field (`Doc` + lists/quote/code, no spoiler):

| Feature | Default |
|---------|---------|
| `composeSchema` (block `Doc` + compose marks) | always |
| `composeKeymap` (default keymap off) | always; `submit?: "Enter" \| "Shift-Enter"` omits that chord |
| Mark exclusivity (`none` / `code-strike` / custom) | `"none"` |
| Mention + custom emoji schema elements | `hostElements: false` |
| Markdown input rules (`**bold**`, `` `code` ``, finished fences; no spoiler) | `markdown: true` |
| Markdown plain-text paste | `markdownPaste: true` |
| Floating selection toolbar (`Menu.Group.top`) | `floating: true` |
| Embedded toolbar (`embeddedMenu`) | `false` |
| Placeholder | `"Message…"` |
| Sync `@username ` → mention | only if `resolveMention` provided |
| Mention picker query (`onMentionQuery`) | omitted. Word-start `@query` + caret box; `null` when unfocused / no query / no rect. Does **not** consume Space. Leave `resolveMention` unset for picker hosts. |
| Link add prompt | `linkPrompt` → `link({prompt})` (default `"floating"`) |
| Submit chord (`submit`) | omitted (Enter splits, Shift-Enter breaks). `"Enter"` / `"Shift-Enter"` omits that chord; the other is `insertLineBreak`. Host binds send with `EditorState.prec.high(KeyBinding.of({key, run}))`. Arrisa does not send. A missing host binding may fall through to `beforeinput` split. |

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

Default toggle **removes** existing links or opens add UI; it does **not** prefill `href` (remove-first). `cancel` dismisses the built-in floating field and focuses the editor; custom prompts still own their DOM.

`onMentionQuery` fires from an `Arrisa.updateListener` when the collapsed caret sits in a **plain-text** mention query. Offsets are UTF-16 dump indices (`docToFormattedText` space). `rect` is `editor.selectionRect()` (`{top,left,width,height}`) on that turn. Use `detectMentionQuery(state)` to inspect the dump range without a live editor.

| Caret | Callback |
|-------|----------|
| Word-start `@` (start of textblock or whitespace before `@`) | `query` = chars until caret (`""` if `@` alone) |
| Same, more typing (`@al`) | same `from`, growing `query` / `to` / `rect` |
| Mid-word / email (`a@b`) | `null` |
| Inside or on a `MentionName` mark (including caret after a completed `@name` label) | `null` |
| Left of `@`, or whitespace / `]` in the query | `null` |
| Inside `pre` / inline `code` | `null` |
| Unfocused, non-collapsed selection, or no caret box | `null` |

Does **not** consume Space or wrap text. Keep `resolveMention` unset when the host owns a picker (`insertMention` / `insertMentionSpec` with the query `from`/`to`).

`messengerCompose(config?)` remains the **inline/spoiler** path:

| Feature | Default |
|---------|---------|
| `messengerSchema` (inline doc + marks) | always |
| Mark exclusivity (`none` / `code-strike` / custom) | `"none"` |
| Mention + custom emoji schema elements | `hostElements: true` |
| Markdown input rules (`**bold**`, `` `code` ``, …) | `markdown: true` |
| Markdown plain-text paste | `markdownPaste: true` |
| Floating selection toolbar (inline group) | `floating: true` |
| Placeholder | `"Message…"` |
| Sync `@username ` → mention | only if `resolveMention` provided |

Does **not** include history — add `@arrisa/history` in the host.

### Markdown

Typing (input rules) and paste share messenger-style delimiters:

- `**bold**`, `__italic__`, `~~strike~~`, `||spoiler||`. Typing `` `code` `` applies the inline code mark
- A finished fence becomes a code block when the schema can contain one: one line `` ```code``` ``, one paragraph with line breaks, or a closing `` ``` `` paragraph after an opening `` ``` `` / `` ```lang `` paragraph. Otherwise the backticks stay text
- `` ``` `` followed by a space at the start of a block is unchanged (empty code block; `` ```lang `` then space sets the language)
- Paste also understands `[label](url)`, fenced code, and `> ` quotes via `parseMarkdownText`
- `composeField` omits the spoiler input rule; paste/import skip spoiler entities when `Spoiler` is not in the schema

### Host atoms

- **`MentionName`** — mark with host user id; non-inclusive so typing after does not extend it. Export `mentionText` (`"label"` default, `"userId"`, or a function) serializes the dump slice independently of the visible label; overlapping marks cover that serialized length. Import `mentionLabel(userId, raw)` replaces the dump slice with a display label. `composeField({onMentionQuery})` emits a dump-range query + caret box for a host picker and does not consume Space — leave `resolveMention` unset on that path. `insertMention` / `insertMentionSpec` take optional `from`/`to` dump offsets (UTF-16, same space as `docToFormattedText`). Both are required together; one without the other or an out-of-range pair returns `false` and leaves the document unchanged. Omit both to insert at the selection. When dump offsets come from a custom `mentionText` serializer, pass the same `mentionText` on insert (default mapping is `"label"`). The caret is left after the mention (no trailing space required).
- **`CustomEmoji`** — leaf `{documentId, alt}`; text contribution is `alt` for entity offsets

## Main public API

### Compose

```ts
import {
    composeField,
    type ComposeFieldConfig,
    messengerCompose,
    type MessengerComposeConfig,
    messengerMarks,
    messengerSchema,
    markExclusivity,
} from "@arrisa/message"
// Schema / command pieces are also available from @arrisa/schema and @arrisa/command.
composeField({
    exclusivity: "none",
    floating: true,              // or FloatingMenuConfig | false
    embedded: false,             // or EmbeddedMenuConfig
    placeholder: "Message…",     // or false
    markdown: true,
    markdownPaste: true,
    hostElements: false,
    resolveMention: (u) => ids[u] ?? null, // omit when using onMentionQuery
    onMentionQuery: (q) => hostShowMentionPicker(q),
    linkPrompt: "floating",      // or false | (req) => { req.apply(url) }
    submit: "Enter",             // omit Enter; host binds send. or "Shift-Enter"
})
messengerCompose({
    exclusivity: "code-strike",
    floating: true,              // or FloatingMenuConfig | false
    placeholder: "Message…",     // or false
    markdown: true,
    markdownPaste: true,
    hostElements: true,
    resolveMention: (u) => ids[u] ?? null,
})
```

`messengerMarks` / `messengerSchema` / `markExclusivity` are re-exported for hosts that only need pieces. Prefer `composeField` for a block chat field; `messengerCompose` for the inline/spoiler path.

### Entities and I/O

```ts
import {
    type FormattedText,
    type MessageEntity,
    type FlagEntity,
    type TextUrlEntity,
    type PreEntity,
    type BlockquoteEntity,
    type UnorderedListEntity,
    type OrderedListEntity,
    type MentionNameEntity,
    type CustomEmojiEntity,
    type AutoEntity,
    entityInBounds,
    unorderedListEntity,
    orderedListEntity,
    docToFormattedText,
    type ToFormattedOptions,
    formattedTextToDoc,
    materializeRuns,
    type FromFormattedOptions,
} from "@arrisa/message"

let ft = docToFormattedText(doc, {
    blockSeparator: "\n",
    autoDetect: true, // skips type "mention" when MentionName is in the schema
    mentionText: (userId) => `@[${userId}]`,
    blockquoteCanCollapse: true,
})

let doc2 = formattedTextToDoc(ft, schema, {
    blockSeparator: "\n",
    mentionLabel: (userId, raw) => labels[userId] ?? raw,
})
```

- **Inline schemas** — single stream; `\n` becomes line breaks when present.
- **Block schemas** — paragraphs; `pre` → code block; `unordered_list` / `ordered_list` wrap as `BulletList` / `OrderedList` of `ListItem`s (one item per paragraph or code block); `blockquote` wraps ranges. Cut-set covers pre + lists + blockquote; **lists wrap before quotes** so a quote covering a whole list becomes `Blockquote > List`. Quote-only and partial quotes are supported. Ordered `startIndex` is omitted when 1. One-level lists are required.
- Out-of-range entities are dropped on import (`entityInBounds`).
- **Custom emoji** — marks that only partially overlap a `custom_emoji` atom are dropped around the atom (fully-contained entities only).

### Auto entities

```ts
import {detectAutoEntities, mergeAutoEntities, type AutoDetectOptions} from "@arrisa/message"

// Used by docToFormattedText({autoDetect: true})
let auto = detectAutoEntities(text, {types: ["url", "email", "hashtag"]})
```

Detects `url`, `email`, `phone`, `hashtag`, `cashtag`, `bot_command`, `mention` without overlapping skip ranges or each other.

`docToFormattedText({autoDetect: true})` omits type `"mention"` when the document schema registers `MentionName`. Explicit `autoDetect: {types: [...]}` is never rewritten.

`mergeAutoEntities` / `autoDetect` skip only **exclusive** ranges (`pre`, inline `code`, `custom_emoji`, `text_url`, `mention_name`, existing autos) — **not** style marks. A bold URL gets both `bold` and `url`.

### Mark ↔ entity map

```ts
import {
    markToEntityPartial,
    entityToMark,
    DEFAULT_FLAG_MARKS,
    markKey,
    isInlineEntityMark,
} from "@arrisa/message"
```

### Markdown

```ts
import {
    markdownInputRules,
    markdownBold,
    markdownItalic,
    markdownStrike,
    markdownSpoiler,
    markdownCode,
    markdownCodeBlock,
    parseMarkdownText,
    markdownPaste,
    markdownClipboardParser,
    looksLikeMarkdown,
} from "@arrisa/message"
```

### Schema elements and insert

```ts
import {
    CustomEmoji,
    MentionName,
    customEmoji,
    mentionName,
    messengerHostElements,
    type CustomEmojiParam,
    insertCustomEmoji,
    insertMention,
    insertCustomEmojiSpec,
    insertMentionSpec,
    mentionResolve,
    mentionResolveRule,
    detectMentionQuery,
    type MentionQuery,
} from "@arrisa/message"

// Programmatic insert (pure specs available for tests)
insertMentionSpec(state, {userId: "u1", label: "@alice"})
// Replace a dump-text range (UTF-16 offsets, same space as docToFormattedText)
insertMentionSpec(state, {userId: "u1", label: "@alice", from: 3, to: 6})
insertMentionSpec(state, {
    userId: "u1",
    label: "@alice",
    from: 8,
    to: 11,
    mentionText: (id) => `@[${id}]`,
})
insertCustomEmojiSpec(state, {documentId: "sticker-1", alt: "👍"})

// Typing: @alice␣ → mention when resolve returns an id
mentionResolve((name) => name == "alice" ? "user-alice" : null)

// Picker path (no Space): dump range without a live editor
detectMentionQuery(state) // {from, to, query} | null
```

### Code token roles

Re-exported from `@arrisa/schema`:

```ts
import {highlightCode, type CodeRole, type CodeSpan} from "@arrisa/message"

let spans = highlightCode(source, "ts")
```

`highlightCode(text, language?)` returns `CodeSpan[]`. `from` and `to` are UTF-16 indexes into `text` (`from` inclusive, `to` exclusive).

Spans are a view. They are not part of `PreEntity` or the dump.

Blocks over 32_000 UTF-16 units or 400 lines return `[]`.

Roles: `kw-flow`, `kw-decl`, `modifier`, `type`, `function`, `property`, `string`, `interpolation`, `escape`, `number`, `constant`, `comment`, `directive`, `tag`, `attribute`, `regex`.

Doc comments set `emphasis: "bold"`. Other spans omit `emphasis`.

Language ids are case-folded. Aliases: `typescript` → `ts`, `javascript` → `js`, `python` → `py`, `kotlin` → `kt`, `yml` → `yaml`. An omitted language colors JavaScript keywords and constants; other identifiers stay plain. A non-empty unknown language id does not add keywords.

## Layering / related packages

```
@arrisa/schema (composeSchema / messengerSchema)
        ↓
@arrisa/message (composeField / messengerCompose + FormattedText + host elements)
        ↓
host chat app
```

| Package | Relationship |
|---------|----------------|
| `@arrisa/schema` | Marks, `composeSchema`, `messengerSchema`, exclusivity config base |
| `@arrisa/types` | Strong, Link, Code, … mapped to entity flags |
| `@arrisa/editor` | Input rules, clipboard parser, floating menu, placeholder |
| `@arrisa/command` | `markExclusivity`, menu templates |
| `@arrisa/history` | Undo — add separately |

## Security

- **Paste/HTML**: markdown paste builds a document from plain text; general HTML paste still needs `Arrisa.htmlSanitize` if the host allows rich HTML.
- **Links**: entity `text_url` / Link marks should use safe hrefs (`@arrisa/types` helpers) when rendering clickable UI.
- **Mentions / emoji**: host-controlled ids; treat remote `FormattedText` as untrusted input (validate bounds, id formats).
- See [SECURITY.md](https://github.com/inshinrei/arrisa/blob/main/SECURITY.md).

## License

MIT © [inshinrei](https://github.com/inshinrei)
