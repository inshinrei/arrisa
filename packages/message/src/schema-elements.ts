/**
 * Messenger-specific schema elements: mention mark and custom emoji leaf.
 */
import {Leaf, Mark, ValidationError, parse} from "@arrisa/doc"
import {EditorState} from "@arrisa/state"

/** Param for {@link CustomEmoji}: wire id + plain-text fallback (alt). */
export type CustomEmojiParam = {
    documentId: string
    alt: string
}

function validateCustomEmoji(val: unknown): asserts val is CustomEmojiParam {
    if (
        !val ||
        typeof val != "object" ||
        typeof (val as CustomEmojiParam).documentId != "string" ||
        !(val as CustomEmojiParam).documentId ||
        typeof (val as CustomEmojiParam).alt != "string" ||
        !(val as CustomEmojiParam).alt
    ) {
        throw new ValidationError(`Invalid custom emoji: ${JSON.stringify(val)}`)
    }
}

/**
 * Inline custom emoji atom. Renders as `img.arrisa-custom-emoji`.
 * Text form is {@link CustomEmojiParam.alt} (UTF-16 length used for entity offsets).
 */
export const CustomEmoji = Leaf.Type.define<CustomEmojiParam>("CustomEmoji", {
    inline: true,
    selectable: true,
    validate: validateCustomEmoji,
    toText: (node) => (node.param as CustomEmojiParam).alt,
    shape: {
        element: "img",
        attributes: (p: CustomEmojiParam) => ({
            alt: p.alt,
            class: "arrisa-custom-emoji",
            "data-document-id": p.documentId,
            draggable: "false",
        }),
    },
    parseRules: [
        {
            selector: "img.arrisa-custom-emoji[data-document-id]",
            readElement: (elt: Element) => {
                let documentId = elt.getAttribute("data-document-id") || ""
                let alt = elt.getAttribute("alt") || ""
                if (!documentId || !alt) return parse.Reject
                return {documentId, alt}
            },
        },
        {
            selector: "img[data-document-id]",
            readElement: (elt: Element) => {
                let documentId = elt.getAttribute("data-document-id") || ""
                let alt = elt.getAttribute("alt") || ""
                if (!documentId || !alt) return parse.Reject
                return {documentId, alt}
            },
            precedence: -1,
        },
    ],
})

/**
 * Named mention mark. Param is a host user id string.
 * Non-inclusive so typing after a mention does not extend it.
 */
export const MentionName = Mark.Type.define<string>("MentionName", {
    rank: 22,
    inclusive: false,
    validate: (val) => {
        if (typeof val != "string" || !val) throw new ValidationError(`Invalid mention user id: ${val}`)
    },
    shape: {
        element: "span",
        attributes: (userId: string) => ({
            class: "arrisa-mention",
            "data-user-id": userId,
        }),
    },
    parseRules: [
        {
            selector: "span.arrisa-mention[data-user-id]",
            readElement: (elt: Element) => {
                let id = elt.getAttribute("data-user-id") || ""
                return id ? id : parse.Reject
            },
        },
        {
            selector: "a[data-user-id]",
            readElement: (elt: Element) => {
                let id = elt.getAttribute("data-user-id") || ""
                return id ? id : parse.Reject
            },
        },
    ],
})

/** Register {@link CustomEmoji} as a schema element. */
export function customEmoji(): EditorState.Extension {
    return EditorState.schemaElement.of(CustomEmoji)
}

/** Register {@link MentionName} as a schema element. */
export function mentionName(): EditorState.Extension {
    return EditorState.schemaElement.of(MentionName)
}

/** Both messenger host nodes/marks. */
export function messengerHostElements(): EditorState.Extension {
    return [customEmoji(), mentionName()]
}
