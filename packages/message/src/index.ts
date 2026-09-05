/**
 * @arrisa/message — messenger compose, markdown shortcuts, and entity I/O.
 *
 * Layering: `@arrisa/schema` (marks/chrome) → this package (wire format + compose).
 *
 * **Compose**
 * ```ts
 * import {messengerCompose, docToFormattedText} from "@arrisa/message"
 * Arrisa.create({ config: [messengerCompose({resolveMention: (u) => ids[u]}), history()], parent })
 * // on send:
 * let payload = docToFormattedText(editor.state.doc, {autoDetect: true})
 * ```
 *
 * **Entities** — plain text + UTF-16 offset/length ranges (`FormattedText`).
 */
export {
    type MessageEntity,
    type FormattedText,
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
    isAutoEntity,
    isFlagEntity,
    isStructuralEntity,
    isAutoExclusive,
    flagEntity,
    preEntity,
    blockquoteEntity,
    unorderedListEntity,
    orderedListEntity,
    textUrlEntity,
    mentionNameEntity,
    customEmojiEntity,
    autoEntity,
    entityFromPartial,
} from "./entities"

export {docToFormattedText, type ToFormattedOptions} from "./to-formatted"
export {formattedTextToDoc, materializeRuns, type FromFormattedOptions} from "./from-formatted"
export {markToEntityPartial, entityToMark, DEFAULT_FLAG_MARKS, markKey, isInlineEntityMark} from "./mark-map"

export {
    detectAutoEntities,
    mergeAutoEntities,
    type AutoDetectOptions,
} from "./auto-entities"

export {
    markdownInputRules,
    markdownBold,
    markdownItalic,
    markdownStrike,
    markdownSpoiler,
    markdownCode,
} from "./markdown"

export {parseMarkdownText} from "./parse-markdown"
export {markdownPaste, markdownClipboardParser, looksLikeMarkdown} from "./paste-markdown"

export {
    CustomEmoji,
    MentionName,
    customEmoji,
    mentionName,
    messengerHostElements,
    type CustomEmojiParam,
} from "./schema-elements"

export {
    insertCustomEmoji,
    insertMention,
    insertCustomEmojiSpec,
    insertMentionSpec,
} from "./insert"

export {mentionResolve, mentionResolveRule} from "./mention-rule"

export {
    messengerCompose,
    type MessengerComposeConfig,
    messengerMarks,
    messengerSchema,
    markExclusivity,
} from "./compose"
