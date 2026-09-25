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
    insertMentionSpec,
    insertCustomEmoji,
    detectMentionQuery,
    type MentionQuery,
} from "@arrisa/message"

let editor = Arrisa.create({
    parent,
    config: [
        composeField(),
        history(), // not included by compose
    ],
})

// Embedded toolbar + custom link UI (ComposeFieldConfig)
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
    submit: "Enter", // omit that chord; host binds send. or "Shift-Enter"
    hostElements: true,
    // Picker hosts: omit resolveMention. Query offsets are dump UTF-16.
    onMentionQuery: (q: MentionQuery | null) => hostShowMentionPicker(q),
})
// detectMentionQuery(editor.state) — dump {from,to,query} without rect / DOM
// Host send: EditorState.prec.high(KeyBinding.of({key: "Enter", run}))
// Missing host binding may fall through to beforeinput (insertParagraph → enter).
// Default toggle removes existing links or opens add UI; does not prefill href.
// cancel dismisses the built-in floating field and focuses; custom prompts own their DOM.

// Inline/spoiler path:
// messengerCompose({resolveMention: (u) => userMap[u] ?? null})

// Send — mention dump independent of the visible label
let payload = docToFormattedText(editor.state.doc, {
    autoDetect: true, // skips type "mention" when MentionName is registered
    mentionText: (userId) => `@[${userId}]`,
})

// Restore — display label; matching mentionText restores the dump on export
let doc = formattedTextToDoc(payload, editor.state.schema, {
    mentionLabel: (userId, raw) => labels[userId] ?? raw,
})

// Replace a dump-text query (`from`/`to` both required; UTF-16 dump offsets)
insertMentionSpec(editor.state, {
    userId: "u@ex",
    label: "@[u@ex]",
    from: 3,
    to: 6,
    mentionText: (userId) => `@[${userId}]`, // same serializer as the dump
})
```

| Area | Exports |
|------|---------|
| Compose | `composeField`, `ComposeFieldConfig`, `messengerCompose`, `MessengerComposeConfig`, re-exports `messengerMarks`, `messengerSchema`, `markExclusivity` |
| Mention query | `MentionQuery` (`from`/`to` dump offsets, `query`, `rect: ClientBox`), `detectMentionQuery(state)` (no rect; null if not a word-start `@query`) |
| Wire types | `FormattedText`, `MessageEntity`, flag/url/pre/blockquote/`UnorderedListEntity`/`OrderedListEntity`/mention/emoji/auto entity types, `entityInBounds`, predicates (`isAutoEntity`, `isAutoExclusive`, …), constructors (`preEntity`, `unorderedListEntity`, `orderedListEntity`, …) |
| I/O | `docToFormattedText`, `formattedTextToDoc`, `materializeRuns`, option types |
| Auto | `detectAutoEntities`, `mergeAutoEntities`, `AutoDetectOptions` |
| Mark map | `markToEntityPartial`, `entityToMark`, `DEFAULT_FLAG_MARKS`, `markKey`, `isInlineEntityMark` |
| Markdown | `markdownInputRules`, per-delimiter rules, `markdownCodeBlock`, `parseMarkdownText`, `markdownPaste`, `markdownClipboardParser`, `looksLikeMarkdown` |
| Host elements | `CustomEmoji`, `MentionName`, `customEmoji`, `mentionName`, `messengerHostElements`, `CustomEmojiParam` |
| Insert / resolve | `insertCustomEmoji`, `insertMention`, `*Spec` pure helpers (`from`/`to` dump offsets + matching `mentionText` on mention), `mentionResolve`, `mentionResolveRule` |
| Code roles | `highlightCode`, `CodeSpan`, `CodeRole` (re-exported; UTF-16 view, not part of `PreEntity` or the dump) |

## Invariants / pitfalls

1. **UTF-16 offsets** — entity `offset` / `length` use JS string indices, not Unicode code points. Do not re-count with grapheme libraries without converting carefully.
2. **`composeField` / `messengerCompose` do not include history** — always add `@arrisa/history` when undo is required.
3. **`submit` is not send** — Arrisa omits the chord; the host binds it. When `submit` is set, the other chord is `insertLineBreak`. A missing host binding may fall through to `beforeinput` split.
4. **`composeField` is a block `Doc`** (paragraphs, lists, quotes, code; no spoiler). Markdown typing omits `||spoiler||`. **`messengerCompose` defaults to inline** (`InlineDoc` via `messengerSchema`). Block import paths in `formattedTextToDoc` apply when the schema is block-based (`pre`, `blockquote`, `unordered_list`, `ordered_list`). List entities need `BulletList` / `OrderedList` / `ListItem` in the schema; lists wrap before quotes. One-level lists are required (`startIndex` omitted when 1). `composeField` already includes those list types.
5. **`autoDetect` on export** — adds url/email/phone/hashtag/… entities; auto types are **not** re-applied as marks on import (`materializeRuns` skips them). Style marks (bold/italic/…) do **not** block auto detection; `pre` / inline `code` / `text_url` / `mention_name` / `custom_emoji` do (`isAutoExclusive`). When `autoDetect: true` and `MentionName` is in the schema, type `"mention"` is omitted; explicit `autoDetect.types` is never rewritten.
6. **Mentions** — `resolveMention` is **sync**. Typing `@user ` (space) triggers conversion; unknown users stay plain text. `onMentionQuery` is the picker path: word-start `@` / `@al`, `null` for email-like `a@b`, inside or on a `MentionName` (including caret after a completed `@name` label — the `@` is in the mark), `pre` / inline `code`, non-collapsed selection, blur, or missing caret box. It does **not** consume Space or wrap text — keep `resolveMention` unset when the host owns the picker. Query `from`/`to` are UTF-16 dump offsets (same space as `docToFormattedText`); `rect` is `selectionRect()` (`{top,left,width,height}`). `detectMentionQuery` is the pure detector (no `rect`). `mentionText` serializes `MentionName` independently of the visible label (`"label"` default). `mentionLabel` hydrates dump slices to display labels. Round-trip dump text with matching `mentionText` / `mentionLabel`. Overlapping style marks cover the **serialized** slice on export. `insertMention` / `insertMentionSpec` optional `from`/`to` are UTF-16 dump offsets (same space as `docToFormattedText`). Both required; one or out of range → `false` (doc unchanged). Omit both to use the selection. Pass the same `mentionText` used to produce those offsets (default mapping is `"label"`). Caret after the mark; no trailing space required.
7. **`MentionName` is non-inclusive** — typing after a mention does not extend the mark.
8. **Custom emoji** — param is `{documentId, alt}`; export uses `alt` as the text span covered by `custom_emoji`. Alt is atomic (no surrounding mark runs). Marks that only partially overlap a `custom_emoji` range are dropped around the atom.
9. **Exclusivity** — `"code-strike"` isolates Code + Strikethrough from other marks (via `@arrisa/command` mark exclusivity).
10. **Markdown paste** only runs when `looksLikeMarkdown` is true and parse yields entities; otherwise default paste wins.
11. Prefer **`let`** in examples; `const` only for arrow functions / true globals.
12. **`highlightCode(text, language?)`** — returns `CodeSpan[]` with UTF-16 indexes into `text`. Spans are a view. They are not part of `PreEntity` or the dump. Blocks over 32_000 UTF-16 units or 400 lines return `[]`. Doc comments set `emphasis: "bold"`. Roles: `kw-flow`, `kw-decl`, `modifier`, `type`, `function`, `property`, `string`, `interpolation`, `escape`, `number`, `constant`, `comment`, `directive`, `tag`, `attribute`, `regex`. Language ids are case-folded (`typescript` → `ts`, `javascript` → `js`, `python` → `py`, `kotlin` → `kt`, `yml` → `yaml`). A missing, empty, or unknown language does not add keywords.
13. **Fences while typing** — `` `code` `` applies the inline code mark. A finished fence (one line `` ```code``` ``, one paragraph with line breaks, or a closing `` ``` `` paragraph after `` ``` `` / `` ```lang ``) becomes a code block when the schema can contain one. `` ``` `` followed by a space at the start of a block still creates an empty code block, and `` ```lang `` then space sets the language. A fence inside an existing code block does not run. Inline documents leave the backticks as text. Delimiter pairs (`**`, `__`, `~~`, `` ` ``) apply the mark to the inner text and clear stored marks, so typing after the run is unmarked.

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
