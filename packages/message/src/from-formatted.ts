/**
 * {@link FormattedText} → document (UTF-16 offsets).
 */
import {Leaf, Mark, type Node, type Plot, type Schema} from "@arrisa/doc"
import {CodeBlockLanguage} from "@arrisa/types"
import {
    type BlockquoteEntity,
    type CustomEmojiEntity,
    type FormattedText,
    type MessageEntity,
    type PreEntity,
    entityInBounds,
    isAutoEntity,
    isStructuralEntity,
} from "./entities"
import {entityToMark} from "./mark-map"
import {CustomEmoji} from "./schema-elements"

export interface FromFormattedOptions {
    /**
     * When the schema is block-based, split plain runs on this separator into
     * paragraphs. Default `"\\n"`.
     */
    blockSeparator?: string
}

/**
 * Build a document from plain text + entities.
 * - Inline docs: single inline stream with line breaks for `\\n`.
 * - Block docs: paragraphs; `pre` → code block; `blockquote` wraps ranges.
 * - `custom_emoji` → {@link CustomEmoji} leaves when registered.
 * - `mention_name` → {@link MentionName} marks when registered.
 *
 * Marks that only partially overlap a `custom_emoji` atom are dropped for the
 * non-atom segments (only fully-contained entities survive around atoms).
 */
export function formattedTextToDoc(
    ft: FormattedText,
    schema: Schema,
    options: FromFormattedOptions = {},
): Plot.Doc {
    let text = ft.text ?? ""
    let entities = (ft.entities ?? []).filter((e) => entityInBounds(e, text))
    let sep = options.blockSeparator ?? "\n"

    if (schema.docTag.type.spec.inlineContent) {
        return schema.doc(inlineLeaves(text, entities, schema, sep))
    }
    return schema.doc(blockChildren(text, entities, schema, sep))
}

function inlineLeaves(text: string, entities: MessageEntity[], schema: Schema, sep: string): Node[] {
    let atoms = entities
        .filter((e): e is CustomEmojiEntity => e.type == "custom_emoji")
        .sort((a, b) => a.offset - b.offset)

    if (!atoms.length) {
        return runsToNodes(materializeRuns(text, entities, schema), schema, sep)
    }

    // Single interval scan over cut points at each atom boundary.
    let cuts = new Set<number>([0, text.length])
    for (let a of atoms) {
        cuts.add(a.offset)
        cuts.add(a.offset + a.length)
    }
    let points = [...cuts].sort((a, b) => a - b)
    let atomAt = new Map(atoms.map((a) => [a.offset, a]))
    let nodes: Node[] = []
    let hasEmoji = !!schema.getNode("CustomEmoji")

    for (let i = 0; i < points.length - 1; i++) {
        let from = points[i]!,
            to = points[i + 1]!
        if (from >= to) continue
        let atom = atomAt.get(from)
        if (atom && atom.offset + atom.length == to) {
            let alt = text.slice(atom.offset, atom.offset + atom.length) || " "
            if (hasEmoji) {
                nodes.push(CustomEmoji.of({documentId: atom.documentId, alt}))
            } else {
                nodes.push(Leaf.text(alt))
            }
            continue
        }
        let slice = text.slice(from, to)
        let sliceEnt = shiftEntities(
            entities.filter(
                (e) =>
                    e.type != "custom_emoji" &&
                    e.offset >= from &&
                    e.offset + e.length <= to,
            ),
            from,
        )
        nodes.push(...runsToNodes(materializeRuns(slice, sliceEnt, schema), schema, sep))
    }
    return nodes
}

function runsToNodes(runs: Run[], schema: Schema, sep: string): Node[] {
    let nodes: Node[] = []
    for (let run of runs) {
        if (!run.text) continue
        let parts = run.text.split(sep)
        for (let i = 0; i < parts.length; i++) {
            if (parts[i]) nodes.push(Leaf.text(parts[i], run.marks))
            if (i < parts.length - 1) {
                let br = schema.lineBreak
                if (br) nodes.push(br.withMarks(run.marks))
                else nodes.push(Leaf.text(sep, run.marks))
            }
        }
    }
    return nodes
}

/**
 * Structural cut-set over pre + blockquote, then interval walker.
 * Pre wins over quote on the same interval; quote can wrap pre segments.
 */
function blockChildren(text: string, entities: MessageEntity[], schema: Schema, sep: string): Node[] {
    let preRanges = entities.filter((e): e is PreEntity => e.type == "pre")
    let quoteRanges = entities.filter((e): e is BlockquoteEntity => e.type == "blockquote")
    let cuts = new Set<number>([0, text.length])
    for (let e of preRanges) {
        cuts.add(e.offset)
        cuts.add(e.offset + e.length)
    }
    for (let e of quoteRanges) {
        cuts.add(e.offset)
        cuts.add(e.offset + e.length)
    }
    let points = [...cuts].sort((a, b) => a - b)
    let children: Node[] = []
    let paraType = schema.getNode("Paragraph")
    let codeType = schema.getNode("CodeBlock")
    let quoteType = schema.getNode("Blockquote")
    let paraTag = paraType?.isPlot ? paraType.default : null
    let codeTag = codeType?.isPlot ? codeType.default : null
    let quoteTag = quoteType?.isPlot ? quoteType.default : null
    if (!paraTag) throw new Error("Block schema requires a default Paragraph")

    type Seg = {
        from: number
        to: number
        pre: PreEntity | null
        quote: boolean
        nodes: Node[]
    }

    let segs: Seg[] = []
    for (let i = 0; i < points.length - 1; i++) {
        let from = points[i]!,
            to = points[i + 1]!
        if (from >= to) continue
        let exactPre = preRanges.find((e) => e.offset == from && e.offset + e.length == to)
        let pre =
            exactPre ??
            preRanges.find((e) => e.offset <= from && e.offset + e.length >= to) ??
            null
        let quote = quoteRanges.some((q) => q.offset <= from && q.offset + q.length >= to)
        let slice = text.slice(from, to)
        // Inter-block separators from export are not content (avoid empty paras).
        if (!pre && (slice === "" || slice === sep)) continue
        let sliceEntities = shiftEntities(
            entities.filter(
                (e) =>
                    !isStructuralEntity(e) &&
                    e.offset >= from &&
                    e.offset + e.length <= to,
            ),
            from,
        )
        let nodes: Node[]
        if (pre && codeTag) {
            let leaves = inlineLeaves(slice, sliceEntities, schema, sep)
            let tag = codeTag
            if (pre.language && schema.getMark("CodeBlockLanguage")) {
                tag = tag.withMarks(CodeBlockLanguage.of(pre.language).addToSet(tag.marks))
            }
            nodes = [tag.create(leaves)]
        } else {
            nodes = paragraphsFromSlice(slice, sliceEntities, schema, sep, paraTag)
        }
        segs.push({from, to, pre, quote, nodes})
    }

    // Group consecutive quote segments into one blockquote wrapper.
    let i = 0
    while (i < segs.length) {
        let seg = segs[i]!
        if (seg.quote && quoteTag) {
            let wrapped: Node[] = [...seg.nodes]
            let j = i + 1
            while (j < segs.length && segs[j]!.quote) {
                wrapped.push(...segs[j]!.nodes)
                j++
            }
            children.push(quoteTag.create(wrapped))
            i = j
        } else {
            children.push(...seg.nodes)
            i++
        }
    }

    return children.length ? children : [schema.createDefault(schema.docTag.type)]
}

function paragraphsFromSlice(
    slice: string,
    sliceEntities: MessageEntity[],
    schema: Schema,
    sep: string,
    paraTag: Plot.Tag,
): Node[] {
    let lines = slice.length ? slice.split(sep) : [""]
    if (lines.length > 1 && lines[lines.length - 1] === "" && slice.endsWith(sep)) lines.pop()
    let lineStart = 0
    let paras: Node[] = []
    for (let li = 0; li < lines.length; li++) {
        let line = lines[li]!
        let lineEntities = shiftEntities(
            sliceEntities.filter(
                (e) => e.offset >= lineStart && e.offset + e.length <= lineStart + line.length,
            ),
            lineStart,
        )
        let leaves = inlineLeaves(line, lineEntities, schema, sep) as Leaf[]
        paras.push(paraTag.create(leaves))
        lineStart += line.length + (li < lines.length - 1 ? sep.length : 0)
    }
    return paras
}

function shiftEntities(entities: MessageEntity[], delta: number): MessageEntity[] {
    if (!delta) return entities
    return entities.map((e) => ({...e, offset: e.offset - delta}))
}

interface Run {
    text: string
    marks: Mark.Set
}

/** Split `text` into maximal runs with a constant mark set from entities. */
export function materializeRuns(text: string, entities: MessageEntity[], schema: Schema): Run[] {
    if (!text) return []

    type Ev = {at: number; open: boolean; mark: Mark}
    let events: Ev[] = []
    for (let e of entities) {
        if (e.type == "custom_emoji" || isStructuralEntity(e) || isAutoEntity(e)) continue
        let mark = entityToMark(e, schema)
        if (!mark || e.length <= 0) continue
        events.push({at: e.offset, open: true, mark})
        events.push({at: e.offset + e.length, open: false, mark})
    }
    events.sort((a, b) => a.at - b.at || (a.open === b.open ? 0 : a.open ? 1 : -1))

    let runs: Run[] = []
    let active: Mark[] = []
    let cursor = 0

    let flushTo = (at: number) => {
        if (at <= cursor) return
        let slice = text.slice(cursor, at)
        let marks: Mark.Set = Mark.none
        for (let m of active) marks = m.addToSet(marks)
        runs.push({text: slice, marks})
        cursor = at
    }

    for (let ev of events) {
        if (ev.at > text.length) break
        flushTo(ev.at)
        if (ev.open) {
            active.push(ev.mark)
        } else {
            let idx = active.findIndex((m) => m.eq(ev.mark))
            if (idx >= 0) active.splice(idx, 1)
        }
    }
    flushTo(text.length)
    return runs
}
