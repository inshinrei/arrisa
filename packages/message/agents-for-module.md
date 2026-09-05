# AGENTS.md

> Guidelines for AI coding agents working in projects that depend on `@arrisa/message` (when installed from npm).
>
> This lightweight guide is copied to `dist/AGENTS.md` during build and ships inside the published package.

## When to use

- Building a **chat / messenger compose** field (inline marks, markdown shortcuts, floating toolbar).
- **Block chat field** (`composeField`): paragraphs, lists, quotes, fenced code — no spoiler/headings/media.
- Converting between the editor document and a **plain text + UTF-16 entity** wire format (`FormattedText`).
- Host features: **mentions** (`MentionName`), **custom emoji** (`CustomEmoji`), optional `@name ` resolve.

For full multi-block document editors, use `@arrisa/schema` presets (`basicSchema` / `fullSchema`), not this package alone. `composeField` is the lean block-chat subset, not a document editor.

## Public API patterns

```ts
import {Arrisa} from "@arrisa/editor"
import {history} from "@arrisa/history"
import {
    composeField,
    messengerCompose,
    docToFormattedText,
    formattedTextToDoc,
    insertMention,
    insertCustomEmoji,
} from "@arrisa/message"

let editor = Arrisa.create({
    parent,
    config: [
        composeField(),
        history(), // not included by compose
    ],
})

// Inline/spoiler path:
// messengerCompose({resolveMention: (u) => userMap[u] ?? null})

// Send
let payload = docToFormattedText(editor.state.doc, {autoDetect: true})

// Restore
let doc = formattedTextToDoc(payload, editor.state.schema)
```

| Area | Exports |
|------|---------|
| Compose | `composeField`, `ComposeFieldConfig`, `messengerCompose`, `MessengerComposeConfig`, re-exports `messengerMarks`, `messengerSchema`, `markExclusivity` |
| Wire types | `FormattedText`, `MessageEntity`, flag/url/pre/blockquote/list/mention/emoji/auto entity types, `entityInBounds`, predicates (`isAutoEntity`, `isAutoExclusive`, …), constructors (`preEntity`, `unorderedListEntity`, `orderedListEntity`, …) |
| I/O | `docToFormattedText`, `formattedTextToDoc`, `materializeRuns`, option types |
| Auto | `detectAutoEntities`, `mergeAutoEntities`, `AutoDetectOptions` |
| Mark map | `markToEntityPartial`, `entityToMark`, `DEFAULT_FLAG_MARKS`, `markKey`, `isInlineEntityMark` |
| Markdown | `markdownInputRules`, per-delimiter rules, `parseMarkdownText`, `markdownPaste`, `markdownClipboardParser`, `looksLikeMarkdown` |
| Host elements | `CustomEmoji`, `MentionName`, `customEmoji`, `mentionName`, `messengerHostElements`, `CustomEmojiParam` |
| Insert / resolve | `insertCustomEmoji`, `insertMention`, `*Spec` pure helpers, `mentionResolve`, `mentionResolveRule` |

## Invariants / pitfalls

1. **UTF-16 offsets** — entity `offset` / `length` use JS string indices, not Unicode code points. Do not re-count with grapheme libraries without converting carefully.
2. **`composeField` / `messengerCompose` do not include history** — always add `@arrisa/history` when undo is required.
3. **`composeField` is a block `Doc`** (paragraphs, lists, quotes, code; no spoiler). **`messengerCompose` defaults to inline** (`InlineDoc` via `messengerSchema`). Pass `codeBlocks: true` on messenger for block `Doc` + paragraphs + `CodeBlock` (fence input rule, `pre` FormattedText I/O). Block import paths in `formattedTextToDoc` apply when the schema is block-based (`pre`, `blockquote`, `unordered_list`, `ordered_list`). List entities need `BulletList` / `OrderedList` / `ListItem` in the schema; lists wrap before quotes. One-level lists are required (`startIndex` omitted when 1). `composeField` already includes those list types.
4. **`autoDetect` on export** — adds url/email/phone/hashtag/… entities; auto types are **not** re-applied as marks on import (`materializeRuns` skips them). Style marks (bold/italic/…) do **not** block auto detection; `pre` / inline `code` / `text_url` / `mention_name` / `custom_emoji` do (`isAutoExclusive`).
5. **Mentions** — `resolveMention` is **sync**. Typing `@user ` (space) triggers conversion; unknown users stay plain text.
6. **`MentionName` is non-inclusive** — typing after a mention does not extend the mark.
7. **Custom emoji** — param is `{documentId, alt}`; export uses `alt` as the text span covered by `custom_emoji`. Alt is atomic (no surrounding mark runs). Marks that only partially overlap a `custom_emoji` range are dropped around the atom.
8. **Exclusivity** — `"code-strike"` isolates Code + Strikethrough from other marks (via `@arrisa/command` mark exclusivity).
9. **Markdown paste** only runs when `looksLikeMarkdown` is true and parse yields entities; otherwise default paste wins.
10. Prefer **`let`** in examples; `const` only for arrow functions / true globals.

## What not to do

- Do **not** invent entity types not in `MessageEntity` / export mapping.
- Do **not** use code-unit offsets from another language’s UTF-8 API without conversion.
- Do **not** treat schema validation as sanitization for HTML or remote payloads.
- Do **not** skip registering host elements when calling `insertMention` / `insertCustomEmoji` (needs marks/nodes in schema — `messengerCompose` default `hostElements: true`; `composeField` default `false`, pass `hostElements: true`).
- Do **not** pull monorepo-only paths; depend on the published package surface only.

## Related packages

| Package | Use when |
|---------|----------|
| `@arrisa/schema` | Document presets; underlying messenger marks |
| `@arrisa/types` | Standard marks/nodes |
| `@arrisa/editor` | View, clipboard, floating menu |
| `@arrisa/history` | Undo/redo |
| `@arrisa/collab` | Rare for compose; only if multi-user draft sharing |

## When in doubt

- Prefer `composeField()` for a block chat field, `messengerCompose()` for the inline/spoiler path — not assembling marks manually.
- Round-trip a sample with `docToFormattedText` → `formattedTextToDoc` in a unit test.
- Security: [SECURITY.md](https://github.com/inshinrei/arrisa/blob/main/SECURITY.md).

## Keep in sync

When changing public exports or recommended usage, update this file and `README.md` in the same change. Only document what `src/index.ts` re-exports.
