/**
 * Document → {@link FormattedText} (UTF-16 offsets).
 */
import {type Leaf, type Mark, Node, type Plot} from "@arrisa/doc"
import {CodeBlockLanguage} from "@arrisa/types"
import {mergeAutoEntities, type AutoDetectOptions} from "./auto-entities"
import type {FormattedText, MessageEntity} from "./entities"
import {isInlineEntityMark, markKey, markToEntityPartial} from "./mark-map"
import type {CustomEmojiParam} from "./schema-elements"

export interface ToFormattedOptions {
    /** Separator between block textblocks. Default `"\\n"`. */
    blockSeparator?: string
    /** Custom text for non-text leaves (default: `toText` or empty). */
    leafText?: (node: Leaf) => string
    /**
     * Detect auto entities (url, email, hashtag, …) on the flattened text.
     * Pass `true` for defaults, or an options object.
     */
    autoDetect?: boolean | AutoDetectOptions
    /**
     * When exporting blockquotes, set `canCollapse` on each blockquote entity.
     * Default: omit the field.
     */
    blockquoteCanCollapse?: boolean
}

/**
 * Flatten a document to plain text + entities.
 * Offsets/lengths are UTF-16 code units (JS string indices).
 */
export function docToFormattedText(doc: Plot.Doc, options: ToFormattedOptions = {}): FormattedText {
    let flat = new Flattener(options.blockSeparator ?? "\n", options.leafText, options.blockquoteCanCollapse)
    walk(doc, flat)
    flat.finish()
    let entities = flat.entities.filter((e) => e.length > 0)
    entities.sort((a, b) => a.offset - b.offset || b.length - a.length || a.type.localeCompare(b.type))

    let text = flat.text
    if (options.autoDetect) {
        let autoOpts = options.autoDetect === true ? {} : options.autoDetect
        entities = mergeAutoEntities(text, entities, autoOpts)
    }

    return entities.length ? {text, entities} : {text}
}

class Flattener {
    text = ""
    entities: MessageEntity[] = []
    startedBlocks = false
    readonly blockSep: string
    private runs = new Map<string, {start: number; mark: Mark}>()

    constructor(
        blockSep: string,
        readonly leafText?: (node: Leaf) => string,
        readonly blockquoteCanCollapse?: boolean,
    ) {
        this.blockSep = blockSep
    }

    get offset() {
        return this.text.length
    }

    openBlock() {
        if (this.startedBlocks) {
            this.closeAllRuns()
            this.text += this.blockSep
        } else {
            this.startedBlocks = true
        }
    }

    append(s: string, marks: Mark.Set) {
        if (!s) return
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
        this.text += s
    }

    /** Append custom emoji atom (alt text + entity). */
    appendCustomEmoji(param: CustomEmojiParam, marks: Mark.Set) {
        this.closeAllRuns()
        // Keep surrounding marks? emoji is atomic — close runs, emit plain alt under marks? 
        // Spec: custom emoji is its own entity; alt is the text contribution.
        let start = this.offset
        // Re-open mark runs for alt if needed — typically no marks on emoji
        this.append(param.alt, marks)
        this.closeAllRuns()
        this.entities.push({
            type: "custom_emoji",
            offset: start,
            length: param.alt.length,
            documentId: param.documentId,
        })
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
        this.entities.push({...partial, offset: run.start, length} as MessageEntity)
    }
}

function walk(node: Node, flat: Flattener) {
    if (node.isText) {
        flat.append(node.param as string, node.marks)
        return
    }
    if (node.isLeaf) {
        if (node.type.name == "CustomEmoji") {
            flat.appendCustomEmoji(node.param as CustomEmojiParam, node.marks)
            return
        }
        let t = node.type.spec.toText
            ? node.type.spec.toText(node)
            : flat.leafText
              ? flat.leafText(node)
              : ""
        if (t) flat.append(t, node.marks)
        return
    }
    let plot = node as Plot
    let isCode = plot.type.hasRole(Node.Role.Code)
    let isQuote = plot.type.name == "Blockquote"
    let hadStarted = flat.startedBlocks
    let beforeChildren = flat.offset
    if (plot.isTextblock) flat.openBlock()
    let contentStart = flat.offset
    for (let child of plot.content) walk(child, flat)
    let contentEnd = flat.offset
    if (contentEnd > contentStart) {
        let start = contentStart
        if (!plot.isTextblock && hadStarted && flat.text.startsWith(flat.blockSep, beforeChildren)) {
            start = beforeChildren + flat.blockSep.length
        }
        if (contentEnd > start) {
            if (isCode) {
                let language = plot.tag.mark(CodeBlockLanguage)
                let ent: MessageEntity = {type: "pre", offset: start, length: contentEnd - start}
                if (typeof language == "string" && language) (ent as {language?: string}).language = language
                flat.entities.push(ent)
            }
            if (isQuote) {
                let ent: MessageEntity = {
                    type: "blockquote",
                    offset: start,
                    length: contentEnd - start,
                }
                if (flat.blockquoteCanCollapse != null) {
                    ;(ent as {canCollapse?: boolean}).canCollapse = flat.blockquoteCanCollapse
                }
                flat.entities.push(ent)
            }
        }
    }
}
