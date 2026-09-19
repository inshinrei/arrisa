/**
 * Map UTF-16 dump offsets (same space as {@link docToFormattedText}) to document
 * positions and back.
 */
import {type Plot} from "@arrisa/doc"
import {collectDumpSpans, type DumpIndex, type ToFormattedOptions} from "./to-formatted"

/**
 * Document position for a dump offset, or `false` when out of range.
 * `from` is a half-open start (`[offset, …)`); `to` is a half-open end (`[…, offset)`),
 * including `dumpLength` as the end of dump content.
 */
export function docPosAtDumpOffset(
    doc: Plot.Doc,
    offset: number,
    edge: "from" | "to",
    options?: ToFormattedOptions,
): number | false {
    return docPosAtIndex(collectDumpSpans(doc, options), offset, edge)
}

export function docPosAtIndex(index: DumpIndex, offset: number, edge: "from" | "to"): number | false {
    let {spans, dumpLength} = index
    if (offset < 0 || offset > dumpLength) return false
    if (offset == dumpLength) {
        if (edge != "to") return false
        return spans.length ? spans[spans.length - 1]!.docTo : 0
    }
    if (offset == 0 && edge == "to") {
        return spans.length ? spans[0]!.docFrom : 0
    }
    for (let span of spans) {
        if (edge == "from") {
            if (offset < span.dumpFrom || offset >= span.dumpTo) continue
        } else if (offset <= span.dumpFrom || offset > span.dumpTo) {
            continue
        }
        let dumpLen = span.dumpTo - span.dumpFrom
        let docLen = span.docTo - span.docFrom
        if (!span.rewrite && dumpLen == docLen) return span.docFrom + (offset - span.dumpFrom)
        return edge == "from" ? span.docFrom : span.docTo
    }
    return false
}

/**
 * Dump offset for a document position, or `false` when out of range.
 * Inverse of {@link docPosAtDumpOffset} with `edge: "to"` (caret / exclusive end).
 */
export function dumpOffsetAtDocPos(doc: Plot.Doc, pos: number, options?: ToFormattedOptions): number | false {
    return dumpOffsetAtIndex(collectDumpSpans(doc, options), pos, doc.length)
}

export function dumpOffsetAtIndex(index: DumpIndex, pos: number, docLength: number): number | false {
    if (pos < 0 || pos > docLength) return false
    let {spans, dumpLength} = index
    if (!spans.length) return 0

    for (let span of spans) {
        let dumpLen = span.dumpTo - span.dumpFrom
        let docLen = span.docTo - span.docFrom
        let rewrite = !!span.rewrite || dumpLen != docLen
        if (!rewrite) {
            if (pos >= span.docFrom && pos <= span.docTo) return span.dumpFrom + (pos - span.docFrom)
            continue
        }
        if (pos == span.docFrom) return span.dumpFrom
        if (pos == span.docTo) return span.dumpTo
        if (pos > span.docFrom && pos < span.docTo) return span.dumpTo
    }
    if (pos <= spans[0]!.docFrom) return 0
    if (pos >= spans[spans.length - 1]!.docTo) return dumpLength
    return false
}
