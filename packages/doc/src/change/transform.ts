/**
 * Section algebra: OT transform and compose for change sets.
 */
import {ValidationError} from "../util/error"
import {Slice} from "../model/slice"
import type {Plot} from "../model/node"
import {applyModsToSlice, combineMods, filterMods} from "./modification"
import {ChangeSet} from "./change"
import {ChangeFitter} from "./fit"
import type {SectionData} from "./sections"
import {SectionIter, addSection} from "./sections"

export function transform(setA: ChangeSet, setB: ChangeSet, doc: Plot.Doc, before: boolean, fit: boolean) {
    if (setA.length != doc.length || setB.length != doc.length)
        throw new ValidationError("Transforming a change that doesn't match the start document")
    let sections: number[] = [],
        data: SectionData[] = []
    let fitter = fit ? new ChangeFitter(doc, false) : null
    let a = new SectionIter(setA.sections, setA.data),
        b = new SectionIter(setB.sections, setB.data),
        pos = 0
    for (let inserted = -1; ;) {
        if (a.keep && b.keep) {
            let len = Math.min(a.len, b.len)
            let mods = before ? a.mods : filterMods(a.mods, b.mods)
            addSection(sections, data, len, mods ? -2 : -1, mods)
            a.forward(len)
            b.forward(len)
            if (fitter) fitter.preserved(pos, pos + len)
            pos += len
        } else if (
            b.ins >= 0 &&
            (a.ins < 0 || inserted == a.i || (a.off == 0 && (b.len < a.len || (b.len == a.len && !before))))
        ) {
            let end = pos + b.len
            addSection(sections, data, b.ins, -1, null)
            if (fitter) fitter.replaced(b.slice, pos, end, true)
            while (pos < end) {
                if (a.done) throw new ValidationError("Mismatched change sets")
                let piece = Math.min(a.len, end - pos)
                if (a.ins >= 0 && inserted < a.i && a.len <= piece) {
                    addSection(sections, data, 0, a.ins, a.slice)
                    if (fitter) fitter.replaced(a.slice, pos - a.off, pos + a.len)
                    inserted = a.i
                }
                a.forward(piece)
                pos += piece
            }
            b.next()
        } else if (a.ins >= 0) {
            let start = pos,
                end = pos + a.len,
                len = 0
            while (pos < end) {
                if (b.keep) {
                    let piece = Math.min(end - pos, b.len)
                    pos += piece
                    len += piece
                    b.forward(piece)
                } else if (b.ins == 0 && pos + b.len < end) {
                    if (fitter) fitter.replaced(b.slice, pos, pos + b.len, true)
                    pos += b.len
                    b.next()
                } else {
                    break
                }
            }
            if (inserted < a.i) {
                addSection(sections, data, len, a.ins, a.slice)
                if (fitter) fitter.replaced(a.slice, start - a.off, start + a.len)
                inserted = a.i
            } else {
                addSection(sections, data, len, 0, Slice.empty)
            }
            a.forward(pos - start)
        } else {
            return {
                set: ChangeSet.new(sections, data),
                fix: fitter && fitter.finish(),
            }
        }
    }
}

export function compose(
    sectionsA: ChangeSet.Sections,
    sectionsB: ChangeSet.Sections,
    dataA?: readonly SectionData[],
    dataB?: readonly SectionData[],
): {sections: ChangeSet.Sections; data: readonly SectionData[] | null} {
    let sections: number[] = [],
        data: SectionData[] | null = dataA ? [] : null
    let a = new SectionIter(sectionsA, dataA),
        b = new SectionIter(sectionsB, dataB)
    for (let open = false; ;) {
        if (a.done && b.done) {
            return {sections, data}
        } else if (a.ins == 0) {
            addSection(sections, data, a.len, 0, a.slice, open)
            a.next()
        } else if (b.len == 0 && !b.done) {
            addSection(sections, data, 0, b.ins, b.slice, open)
            b.next()
        } else if (a.done || b.done) {
            throw new ValidationError("Mismatched change set lengths")
        } else {
            let len = Math.min(a.len2, b.len),
                sectionLen = sections.length
            if (a.keep && b.keep) {
                let mods = combineMods(a.mods, b.mods)
                addSection(sections, data, len, (data ? mods : a.ins == -2 || b.ins == -2) ? -2 : -1, mods, open)
            } else if (a.keep) {
                addSection(sections, data, len, b.off ? 0 : b.ins, b.off ? Slice.empty : b.slice, open)
            } else if (b.keep) {
                addSection(
                    sections,
                    data,
                    a.off ? 0 : a.len,
                    len,
                    data ? applyModsToSlice(a.slicePart(len), b.mods) : null,
                    open,
                )
            } else {
                addSection(sections, data, a.off ? 0 : a.len, b.off ? 0 : b.ins, b.off ? Slice.empty : b.slice, open)
            }
            open = (a.ins > len || (b.ins >= 0 && b.len > len)) && (open || sections.length > sectionLen)
            a.forward2(len)
            b.forward(len)
        }
    }
}

