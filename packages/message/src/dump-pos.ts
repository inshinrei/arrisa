/**
 * Map UTF-16 dump offsets (same space as {@link docToFormattedText}) to document positions.
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
