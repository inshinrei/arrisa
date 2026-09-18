/**
 * Map UTF-16 dump offsets (same space as {@link docToFormattedText}) to document
 * positions and back.
 */
import {type Plot} from "@arrisa/doc"
import {collectDumpSpans, type ToFormattedOptions} from "./to-formatted"

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
    let {spans, dumpLength} = collectDumpSpans(doc, options)
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
        if (dumpLen == docLen) return span.docFrom + (offset - span.dumpFrom)
        return edge == "from" ? span.docFrom : span.docTo
    }
    return false
}

/**
 * Dump offset for a document position, or `false` when out of range.
 * Inverse of {@link docPosAtDumpOffset} with `edge: "to"` (caret / exclusive end).
 */
export function dumpOffsetAtDocPos(doc: Plot.Doc, pos: number, options?: ToFormattedOptions): number | false {
    if (pos < 0 || pos > doc.length) return false
    let {spans, dumpLength} = collectDumpSpans(doc, options)
    if (!spans.length) return 0

    let found: number | false = false
    for (let span of spans) {
        let dumpLen = span.dumpTo - span.dumpFrom
        let docLen = span.docTo - span.docFrom
        if (dumpLen == docLen) {
            if (pos >= span.docFrom && pos <= span.docTo) found = span.dumpFrom + (pos - span.docFrom)
        } else if (pos == span.docFrom) {
            found = span.dumpFrom
        } else if (pos == span.docTo) {
            found = span.dumpTo
        } else if (pos > span.docFrom && pos < span.docTo) {
            found = span.dumpTo
        }
    }
    if (found !== false) return found
    if (pos <= spans[0]!.docFrom) return 0
    if (pos >= spans[spans.length - 1]!.docTo) return dumpLength
    return false
}
