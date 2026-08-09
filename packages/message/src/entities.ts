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

const AUTO_TYPES = new Set<AutoEntity["type"]>([
    "url",
    "email",
    "phone",
    "hashtag",
    "cashtag",
    "bot_command",
    "mention",
])

const FLAG_TYPES = new Set<FlagEntity["type"]>([
    "bold",
    "italic",
    "underline",
    "strike",
    "spoiler",
    "code",
])

/** True when `entity` covers a non-empty range within `text` bounds. */
export function entityInBounds(entity: MessageEntity, text: string): boolean {
    return entity.offset >= 0 && entity.length > 0 && entity.offset + entity.length <= text.length
}

export function isAutoEntity(e: MessageEntity): e is AutoEntity {
    return AUTO_TYPES.has(e.type as AutoEntity["type"])
}

export function isFlagEntity(e: MessageEntity): e is FlagEntity {
    return FLAG_TYPES.has(e.type as FlagEntity["type"])
}

export function isStructuralEntity(e: MessageEntity): e is PreEntity | BlockquoteEntity {
    return e.type == "pre" || e.type == "blockquote"
}

/**
 * Ranges that must not receive overlapping auto-detection.
 * Style flags (bold/italic/…) and blockquote are **not** exclusive — wire
 * formats commonly allow a bold URL or hashtag inside a quote.
 */
export function isAutoExclusive(e: MessageEntity): boolean {
    return (
        e.type == "pre" ||
        e.type == "code" ||
        e.type == "custom_emoji" ||
        e.type == "text_url" ||
        e.type == "mention_name" ||
        isAutoEntity(e)
    )
}

// ── constructors (prefer over casts) ─────────────────────────────────────────

export const flagEntity = (type: FlagEntity["type"], offset: number, length: number): FlagEntity => ({
    type,
    offset,
    length,
})

export const preEntity = (offset: number, length: number, language?: string): PreEntity =>
    language ? {type: "pre", offset, length, language} : {type: "pre", offset, length}

export const blockquoteEntity = (
    offset: number,
    length: number,
    canCollapse?: boolean,
): BlockquoteEntity =>
    canCollapse != null
        ? {type: "blockquote", offset, length, canCollapse}
        : {type: "blockquote", offset, length}

export const textUrlEntity = (offset: number, length: number, url: string): TextUrlEntity => ({
    type: "text_url",
    offset,
    length,
    url,
})

export const mentionNameEntity = (offset: number, length: number, userId: string): MentionNameEntity => ({
    type: "mention_name",
    offset,
    length,
    userId,
})

export const customEmojiEntity = (
    offset: number,
    length: number,
    documentId: string,
): CustomEmojiEntity => ({
    type: "custom_emoji",
    offset,
    length,
    documentId,
})

export const autoEntity = (type: AutoEntity["type"], offset: number, length: number): AutoEntity => ({
    type,
    offset,
    length,
})

/** Complete a mark→entity partial with offset/length. */
export function entityFromPartial(
    partial:
        | {type: FlagEntity["type"]}
        | {type: "text_url"; url: string}
        | {type: "mention_name"; userId: string},
    offset: number,
    length: number,
): MessageEntity {
    if (partial.type == "text_url") return textUrlEntity(offset, length, partial.url)
    if (partial.type == "mention_name") return mentionNameEntity(offset, length, partial.userId)
    return flagEntity(partial.type, offset, length)
}
