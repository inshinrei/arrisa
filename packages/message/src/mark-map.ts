/**
 * Map between document marks and message entity types.
 */
import {type Mark, type Schema} from "@arrisa/doc"
import {
    Code,
    Emphasis,
    Link,
    Spoiler,
    Strong,
    Strikethrough,
    Underline,
} from "@arrisa/types"
import type {FlagEntity, MessageEntity, TextUrlEntity} from "./entities"
import {MentionName} from "./schema-elements"

/** Default arrisa mark name → entity type for flag marks. */
export const DEFAULT_FLAG_MARKS: Readonly<Record<string, FlagEntity["type"]>> = {
    Strong: "bold",
    Emphasis: "italic",
    Underline: "underline",
    Strikethrough: "strike",
    Spoiler: "spoiler",
    Code: "code",
}

/** Default entity type → mark instance (or factory for typed marks). */
const FLAG_MARK_BY_ENTITY: Readonly<Record<FlagEntity["type"], Mark>> = {
    bold: Strong,
    italic: Emphasis,
    underline: Underline,
    strike: Strikethrough,
    spoiler: Spoiler,
    code: Code,
}

export function markKey(mark: Mark): string {
    return mark.value == null ? mark.name : `${mark.name}:${JSON.stringify(mark.value)}`
}

/** Convert a document mark to a partial entity (offset/length filled by caller). */
export function markToEntityPartial(
    mark: Mark,
):
    | {type: FlagEntity["type"]}
    | {type: "text_url"; url: string}
    | {type: "mention_name"; userId: string}
    | null {
    if (mark.type == Link || mark.name == "Link") {
        let url = mark.value
        if (typeof url != "string" || !url) return null
        return {type: "text_url", url}
    }
    if (mark.type == MentionName || mark.name == "MentionName") {
        let userId = mark.value
        if (typeof userId != "string" || !userId) return null
        return {type: "mention_name", userId}
    }
    let flag = DEFAULT_FLAG_MARKS[mark.name]
    if (flag) return {type: flag}
    return null
}

/** Resolve an entity to a mark instance for the given schema (null if unavailable). */
export function entityToMark(entity: MessageEntity, schema: Schema): Mark | null {
    if (entity.type == "text_url") {
        let type = schema.getMark("Link")
        if (!type) return null
        try {
            return type.of((entity as TextUrlEntity).url)
        } catch {
            return null
        }
    }
    if (entity.type == "mention_name") {
        let type = schema.getMark("MentionName") || MentionName
        try {
            return type.of(entity.userId)
        } catch {
            return null
        }
    }
    if (
        entity.type == "bold" ||
        entity.type == "italic" ||
        entity.type == "underline" ||
        entity.type == "strike" ||
        entity.type == "spoiler" ||
        entity.type == "code"
    ) {
        let fallback = FLAG_MARK_BY_ENTITY[entity.type]
        let type = schema.getMark(fallback.name)
        if (!type) return null
        return type.default ?? null
    }
    return null
}

/** Whether this mark should become an inline entity on export. */
export function isInlineEntityMark(mark: Mark): boolean {
    return markToEntityPartial(mark) != null
}
