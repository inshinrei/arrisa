/**
 * {@link FormattedText} → document (UTF-16 offsets).
 */
import {Leaf, Mark, type Node, type Plot, type Schema} from "@arrisa/doc"
import {CodeBlockLanguage} from "@arrisa/types"
import type {CustomEmojiEntity, FormattedText, MessageEntity} from "./entities"
import {entityInBounds} from "./entities"
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

    // Split on custom_emoji atoms
    let nodes: Node[] = []
    let cursor = 0
    let hasEmoji = !!schema.getNode("CustomEmoji")
    for (let atom of atoms) {
        if (atom.offset > cursor) {
            let slice = text.slice(cursor, atom.offset)
            let sliceEnt = shiftEntities(
                entities.filter(
                    (e) =>
                        e.type != "custom_emoji" &&
                        e.offset >= cursor &&
                        e.offset + e.length <= atom.offset,
                ),
                cursor,
            )
            nodes.push(...runsToNodes(materializeRuns(slice, sliceEnt, schema), schema, sep))
        }
        let alt = text.slice(atom.offset, atom.offset + atom.length) || " "
        if (hasEmoji) {
            nodes.push(CustomEmoji.of({documentId: atom.documentId, alt}))
        } else {
            nodes.push(Leaf.text(alt))
        }
        cursor = atom.offset + atom.length
    }
    if (cursor < text.length) {
        let slice = text.slice(cursor)
        let sliceEnt = shiftEntities(
            entities.filter(
                (e) => e.type != "custom_emoji" && e.offset >= cursor && e.offset + e.length <= text.length,
            ),
            cursor,
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

function blockChildren(text: string, entities: MessageEntity[], schema: Schema, sep: string): Node[] {
    let preRanges = entities.filter((e) => e.type == "pre")
    let quoteRanges = entities.filter((e) => e.type == "blockquote")
    let cuts = new Set<number>([0, text.length])
    for (let e of preRanges) {
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

    for (let i = 0; i < points.length - 1; i++) {
        let from = points[i],
            to = points[i + 1]
        if (from >= to) continue
        let pre = preRanges.find((e) => e.offset == from && e.offset + e.length == to)
        let slice = text.slice(from, to)
        let sliceEntities = shiftEntities(
            entities.filter(
                (e) =>
                    e.type != "pre" &&
                    e.type != "blockquote" &&
                    e.offset >= from &&
                    e.offset + e.length <= to,
            ),
            from,
        )
        if (pre && codeTag) {
            let leaves = inlineLeaves(slice, sliceEntities, schema, sep)
            let tag = codeTag
            let lang = (pre as {language?: string}).language
            if (lang && schema.getMark("CodeBlockLanguage")) {
                tag = tag.withMarks(CodeBlockLanguage.of(lang).addToSet(tag.marks))
            }
            children.push(tag.create(leaves))
        } else {
            let lines = slice.length ? slice.split(sep) : [""]
            if (lines.length > 1 && lines[lines.length - 1] === "" && slice.endsWith(sep)) lines.pop()
            let lineStart = 0
            let paras: Node[] = []
            for (let li = 0; li < lines.length; li++) {
                let line = lines[li]
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
            let coveredByQuote = quoteRanges.some((q) => q.offset <= from && q.offset + q.length >= to)
            if (coveredByQuote && quoteTag) {
                children.push(quoteTag.create(paras))
            } else {
                children.push(...paras)
            }
        }
    }
    return children.length ? children : [schema.createDefault(schema.docTag.type)]
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
        if (e.type == "custom_emoji" || e.type == "pre" || e.type == "blockquote") continue
        // skip pure auto entities for import as marks
        if (
            e.type == "url" ||
            e.type == "email" ||
            e.type == "phone" ||
            e.type == "hashtag" ||
            e.type == "cashtag" ||
            e.type == "bot_command" ||
            e.type == "mention"
        ) {
            continue
        }
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
