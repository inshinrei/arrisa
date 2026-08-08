/**
 * Detect plain-text auto entities (url, email, phone, hashtag, cashtag, bot_command, mention).
 * Offsets are UTF-16 code units.
 */
import type {AutoEntity, MessageEntity} from "./entities"

export interface AutoDetectOptions {
    /** Ranges to skip (already covered by marks / pre / etc.). */
    skip?: readonly {offset: number; length: number}[]
    /** Which auto types to detect. Default: all. */
    types?: readonly AutoEntity["type"][]
}

type Detector = {
    type: AutoEntity["type"]
    /** Global sticky regex; must capture the full entity as match[0]. */
    re: RegExp
}

// Order: prefer longer / more specific matches first when equal start.
const DETECTORS: readonly Detector[] = [
    // URL (http(s) or www.)
    {
        type: "url",
        re: /(?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)"'\]]/giu,
    },
    // Email
    {
        type: "email",
        re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/giu,
    },
    // Phone: optional +, digits/spaces/dashes, length-ish 7+
    {
        type: "phone",
        re: /(?<![A-Za-z0-9_])\+?[0-9][0-9\s().-]{5,}[0-9](?![A-Za-z0-9_])/giu,
    },
    // Hashtag
    {
        type: "hashtag",
        re: /#[\p{L}\p{N}_]{1,}/giu,
    },
    // Cashtag
    {
        type: "cashtag",
        re: /\$[A-Za-z]{1,10}\b/giu,
    },
    // Bot command
    {
        type: "bot_command",
        re: /\/[A-Za-z][A-Za-z0-9_]{0,31}(?:@[A-Za-z0-9_]{3,})?/giu,
    },
    // @mention (username)
    {
        type: "mention",
        re: /@[A-Za-z][A-Za-z0-9_]{2,}/giu,
    },
]

function covered(skip: readonly {offset: number; length: number}[], offset: number, length: number): boolean {
    let end = offset + length
    for (let r of skip) {
        let rEnd = r.offset + r.length
        if (offset < rEnd && end > r.offset) return true
    }
    return false
}

/**
 * Scan `text` for auto entities. Does not produce entities that overlap `skip`
 * ranges or each other (first wins by scan order / detector priority).
 */
export function detectAutoEntities(text: string, options: AutoDetectOptions = {}): AutoEntity[] {
    if (!text) return []
    let skip = options.skip ? [...options.skip] : []
    let allow = options.types ? new Set(options.types) : null
    let found: AutoEntity[] = []

    for (let det of DETECTORS) {
        if (allow && !allow.has(det.type)) continue
        let re = new RegExp(det.re.source, det.re.flags)
        let m: RegExpExecArray | null
        while ((m = re.exec(text))) {
            let offset = m.index
            let length = m[0].length
            if (length <= 0) {
                re.lastIndex++
                continue
            }
            if (covered(skip, offset, length) || covered(found, offset, length)) continue
            // Trim trailing punctuation often glued to URLs
            if (det.type == "url") {
                while (length > 0 && /[),.;:!?]$/.test(text[offset + length - 1]!)) length--
                if (length <= 0) continue
            }
            found.push({type: det.type, offset, length})
            skip.push({offset, length})
        }
    }

    found.sort((a, b) => a.offset - b.offset || b.length - a.length)
    return found
}

/** Merge auto entities into an existing entity list (skips overlaps with existing). */
export function mergeAutoEntities(
    text: string,
    entities: readonly MessageEntity[] | undefined,
    options: Omit<AutoDetectOptions, "skip"> = {},
): MessageEntity[] {
    let base = entities ? [...entities] : []
    let skip = base.map((e) => ({offset: e.offset, length: e.length}))
    // Also skip ranges under code / pre / spoiler? Only skip existing entities.
    let auto = detectAutoEntities(text, {...options, skip})
    return base.concat(auto).sort((a, b) => a.offset - b.offset || b.length - a.length || a.type.localeCompare(b.type))
}
