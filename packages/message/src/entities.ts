/**
 * Plain text + offset/length entities for messenger wire formats.
 *
 * Offsets and lengths are **UTF-16 code units** (JavaScript string indices).
 */

/** Flag entity with only offset/length. */
export type FlagEntity = {
    type: "bold" | "italic" | "underline" | "strike" | "spoiler" | "code"
    offset: number
    length: number
}

/** Hyperlink entity (`text_url`). */
export type TextUrlEntity = {
    type: "text_url"
    offset: number
    length: number
    url: string
}

/** Preformatted / code-block entity. */
export type PreEntity = {
    type: "pre"
    offset: number
    length: number
    language?: string
}

/** Blockquote entity spanning one or more lines. */
export type BlockquoteEntity = {
    type: "blockquote"
    offset: number
    length: number
    canCollapse?: boolean
}

/** Host-resolved mention (Phase C). */
export type MentionNameEntity = {
    type: "mention_name"
    offset: number
    length: number
    userId: string
}

/** Host custom emoji atom (Phase C). */
export type CustomEmojiEntity = {
    type: "custom_emoji"
    offset: number
    length: number
    documentId: string
}

/** Auto-detected plain entities (Phase C export). */
export type AutoEntity = {
    type: "url" | "email" | "phone" | "hashtag" | "cashtag" | "bot_command" | "mention"
    offset: number
    length: number
}

export type MessageEntity =
    | FlagEntity
    | TextUrlEntity
    | PreEntity
    | BlockquoteEntity
    | MentionNameEntity
    | CustomEmojiEntity
    | AutoEntity

/** Wire payload: plain text plus optional entity list. */
export type FormattedText = {
    text: string
    entities?: MessageEntity[]
}

/** True when `entity` covers a non-empty range within `text` bounds. */
export function entityInBounds(entity: MessageEntity, text: string): boolean {
    return entity.offset >= 0 && entity.length > 0 && entity.offset + entity.length <= text.length
}
