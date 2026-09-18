/**
 * Document → {@link FormattedText} (UTF-16 offsets).
 */
import {type Leaf, type Mark, Node, type Plot} from "@arrisa/doc"
import {CodeBlockLanguage} from "@arrisa/types"
import {mergeAutoEntities, type AutoDetectOptions} from "./auto-entities"
import {
    blockquoteEntity,
    customEmojiEntity,
    entityFromPartial,
    orderedListEntity,
    preEntity,
    unorderedListEntity,
    type FormattedText,
    type MessageEntity,
} from "./entities"
import {isInlineEntityMark, markKey, markToEntityPartial} from "./mark-map"
import {MentionName, type CustomEmojiParam} from "./schema-elements"

export interface ToFormattedOptions {
    /** Separator between block textblocks. Default `"\\n"`. */
    blockSeparator?: string
    /** Custom text for non-text leaves (default: `toText` or empty). */
    leafText?: (node: Leaf) => string
    /**
     * Detect auto entities (url, email, hashtag, …) on the flattened text.
     * Pass `true` for defaults, or an options object.
     * Style marks do not block auto detection (bold URL keeps both entities).
     * When `true` and the document schema has {@link MentionName}, type `"mention"`
     * is omitted. An explicit `{types: [...]}` object is never rewritten.
     */
    autoDetect?: boolean | AutoDetectOptions
    /**
     * When exporting blockquotes, set `canCollapse` on each blockquote entity.
     * Default: omit the field.
     */
    blockquoteCanCollapse?: boolean
    /**
     * How to serialize text covered by a {@link MentionName} mark.
     * `"label"` (default) keeps the document text; `"userId"` uses the mark param;
     * a function returns the dump slice. Overlapping marks cover the serialized length.
     */
    mentionText?: "label" | "userId" | ((userId: string, label: string) => string)
}

const AUTO_TYPES_WITHOUT_MENTION = ["url", "email", "phone", "hashtag", "cashtag", "bot_command"] as const

const serializedMention = (
    userId: string,
    label: string,
    mentionText?: ToFormattedOptions["mentionText"],
) => {
    if (!mentionText || mentionText == "label") return label
    if (mentionText == "userId") return userId
    return mentionText(userId, label)
}

const mentionUserId = (marks: Mark.Set): string | null => {
    for (let m of marks) {
        if ((m.type == MentionName || m.name == "MentionName") && typeof m.value == "string") {
            return m.value
        }
    }
    return null
}

/**
 * Flatten a document to plain text + entities.
 * Offsets/lengths are UTF-16 code units (JS string indices).
 */
export function docToFormattedText(doc: Plot.Doc, options: ToFormattedOptions = {}): FormattedText {
    let flat = new Flattener(
        options.blockSeparator ?? "\n",
        options.leafText,
        options.blockquoteCanCollapse,
        options.mentionText,
    )
    walk(doc, flat, 0)
    flat.finish()
    let entities = flat.entities.filter((e) => e.length > 0)
    entities.sort((a, b) => a.offset - b.offset || b.length - a.length || a.type.localeCompare(b.type))

    let text = flat.text
    if (options.autoDetect) {
        let autoOpts: AutoDetectOptions = options.autoDetect === true ? {} : {...options.autoDetect}
        if (options.autoDetect === true && doc.schema.getMark("MentionName")) {
            autoOpts.types = AUTO_TYPES_WITHOUT_MENTION
        }
        entities = mergeAutoEntities(text, entities, autoOpts)
    }

    return entities.length ? {text, entities} : {text}
}

/** Dump-text span tied to a document range. Internal to dump-offset mapping. */
export type DumpSpan = {
    dumpFrom: number
    dumpTo: number
    docFrom: number
    docTo: number
}

/** Flatten with the same rules as {@link docToFormattedText}, recording dump↔doc spans. */
export function collectDumpSpans(doc: Plot.Doc, options: ToFormattedOptions = {}) {
    let flat = new Flattener(
        options.blockSeparator ?? "\n",
        options.leafText,
        options.blockquoteCanCollapse,
        options.mentionText,
        true,
    )
    walk(doc, flat, 0)
    flat.finish()
    return {spans: flat.spans, dumpLength: flat.text.length}
}

type StructureKind = "pre" | "blockquote" | "unordered_list" | "ordered_list"

type StructureFrame = {
    kind: StructureKind
    /** Content start; -1 until first block open / text after enter. */
    start: number
    language?: string
    startIndex?: number
}

class Flattener {
    text = ""
    entities: MessageEntity[] = []
    startedBlocks = false
    readonly blockSep: string
    readonly spans: DumpSpan[] = []
    private lastDocTo = 0
    private runs = new Map<string, {start: number; mark: Mark}>()
    /** Explicit structural open stack (enter/leave plot roles). */
    private structure: StructureFrame[] = []

    constructor(
        blockSep: string,
        readonly leafText?: (node: Leaf) => string,
        readonly blockquoteCanCollapse?: boolean,
        readonly mentionText?: ToFormattedOptions["mentionText"],
        readonly collectSpans = false,
    ) {
        this.blockSep = blockSep
    }

    get offset() {
        return this.text.length
    }

    openBlock(contentStart: number) {
        if (this.startedBlocks) {
            this.closeAllRuns()
            let dumpFrom = this.offset
            this.text += this.blockSep
            if (this.collectSpans && this.offset > dumpFrom) {
                this.spans.push({
                    dumpFrom,
                    dumpTo: this.offset,
                    docFrom: this.lastDocTo,
                    docTo: contentStart,
                })
            }
        } else {
            this.startedBlocks = true
        }
        if (this.collectSpans) this.lastDocTo = contentStart
        this.pinPendingStructure()
    }

    enterStructure(kind: StructureKind, language?: string, startIndex?: number) {
        // Pending start: first openBlock/append inside pins the content offset
        // (skips a leading blockSep added by the first child textblock).
        this.structure.push({kind, start: -1, language, startIndex})
    }

    leaveStructure(kind: StructureKind) {
        let top = this.structure.pop()
        if (!top || top.kind != kind) return
        let start = top.start < 0 ? this.offset : top.start
        let length = this.offset - start
        if (length <= 0) return
        if (kind == "pre") {
            this.entities.push(preEntity(start, length, top.language))
        } else if (kind == "blockquote") {
            this.entities.push(blockquoteEntity(start, length, this.blockquoteCanCollapse))
        } else if (kind == "unordered_list") {
            this.entities.push(unorderedListEntity(start, length))
        } else {
            this.entities.push(orderedListEntity(start, length, top.startIndex))
        }
    }

    private pinPendingStructure() {
        for (let s of this.structure) {
            if (s.start < 0) s.start = this.offset
        }
    }

    append(s: string, marks: Mark.Set, docFrom: number, docTo: number) {
        let userId = mentionUserId(marks)
        if (userId != null) s = serializedMention(userId, s, this.mentionText)
        if (!s) return
        this.pinPendingStructure()
        let wanted = new Set<string>()
        for (let m of marks) {
            if (!isInlineEntityMark(m)) continue
            wanted.add(markKey(m))
        }
        for (let [key, run] of [...this.runs]) {
            if (!wanted.has(key)) this.closeRun(key, run)
        }
        for (let m of marks) {
            if (!isInlineEntityMark(m)) continue
            let key = markKey(m)
            if (!this.runs.has(key)) this.runs.set(key, {start: this.offset, mark: m})
        }
        let dumpFrom = this.offset
        this.text += s
        this.recordSpan(dumpFrom, docFrom, docTo)
    }

    /**
     * Custom emoji is atomic: alt does not participate in surrounding mark runs.
     * Close runs, emit plain alt, push entity, leave runs empty.
     */
    appendCustomEmoji(param: CustomEmojiParam, docFrom: number, docTo: number) {
        this.closeAllRuns()
        this.pinPendingStructure()
        let start = this.offset
        this.text += param.alt
        this.entities.push(customEmojiEntity(start, param.alt.length, param.documentId))
        this.recordSpan(start, docFrom, docTo)
    }

    private recordSpan(dumpFrom: number, docFrom: number, docTo: number) {
        if (!this.collectSpans) return
        this.spans.push({dumpFrom, dumpTo: this.offset, docFrom, docTo})
        this.lastDocTo = docTo
    }
    finish() {
        this.closeAllRuns()
    }

    private closeAllRuns() {
        for (let [key, run] of [...this.runs]) this.closeRun(key, run)
    }

    private closeRun(key: string, run: {start: number; mark: Mark}) {
        this.runs.delete(key)
        let partial = markToEntityPartial(run.mark)
        if (!partial) return
        let length = this.offset - run.start
        if (length <= 0) return
        this.entities.push(entityFromPartial(partial, run.start, length))
    }
}

function walk(node: Node, flat: Flattener, pos: number) {
    if (node.isText) {
        flat.append(node.param as string, node.marks, pos, pos + node.length)
        return
    }
    if (node.isLeaf) {
        if (node.type.name == "CustomEmoji") {
            flat.appendCustomEmoji(node.param as CustomEmojiParam, pos, pos + node.length)
            return
        }
        let t = node.type.spec.toText
            ? node.type.spec.toText(node)
            : flat.leafText
              ? flat.leafText(node)
              : ""
        if (t) flat.append(t, node.marks, pos, pos + node.length)
        return
    }
    let plot = node as Plot
    let isCode = plot.type.hasRole(Node.Role.Code)
    let isQuote = plot.type.name == "Blockquote"
    let isBullet = plot.type.name == "BulletList"
    let isOrdered = plot.type.name == "OrderedList"
    if (plot.isTextblock) flat.openBlock(plot.isDoc ? pos : pos + 1)
    if (isCode) {
        let language = plot.tag.mark(CodeBlockLanguage)
        flat.enterStructure("pre", typeof language == "string" && language ? language : undefined)
    }
    if (isQuote) flat.enterStructure("blockquote")
    if (isBullet) flat.enterStructure("unordered_list")
    if (isOrdered) {
        let startIndex = typeof plot.tag.param == "number" ? plot.tag.param : 1
        flat.enterStructure("ordered_list", undefined, startIndex)
    }
    let childPos = plot.isDoc ? pos : pos + 1
    for (let child of plot.content) {
        walk(child, flat, childPos)
        childPos += child.length
    }
    if (isOrdered) flat.leaveStructure("ordered_list")
    if (isBullet) flat.leaveStructure("unordered_list")
    if (isQuote) flat.leaveStructure("blockquote")
    if (isCode) flat.leaveStructure("pre")
}
