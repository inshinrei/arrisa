/**
 * Collect active decoration sources for a state and compute which document
 * ranges need re-rendering after a transaction.
 *
 * Section encoding (shared with ChangeSet-style arrays): each pair is
 * `[len, ins]` where `ins == -1` means kept unchanged, `ins == -2` means dirty
 * (must redraw), and `ins >= 0` means a real insert length from the doc change.
 */
import {ChangeSet} from "@arrisa/doc"
import {EditorState} from "@arrisa/state"
import {Decoration, tagShape, tagWidget, tagWrapper, tagAttribute, ShapeDecoration} from "./decoration"
import {PointSet} from "./point-set"
import {RangeSet} from "./range-set"
import {addRange, joinRanges} from "./range-set"

function compareGlobal(stateA: EditorState, stateB: EditorState, facet: EditorState.Facet<any>) {
    return stateA.facet(facet) != stateB.facet(facet)
}

function compareDecoSet<T>(
    a: Map<any, T>,
    b: Map<any, T>,
    f: (a: T | undefined, b: T | undefined) => void,
) {
    let seen = new Set<any>()
    for (let [k, v] of a) {
        seen.add(k)
        f(v, b.get(k))
    }
    for (let [k, v] of b) if (!seen.has(k)) f(undefined, v)
}

export type DecoSet = {
    points: Map<(state: EditorState) => PointSet<Decoration.Point>, PointSet<Decoration.Point>>
    ranges: Map<(state: EditorState) => RangeSet<Decoration.Range>, RangeSet<Decoration.Range>>
}

export function getDecoSet(state: EditorState) {
    let set: DecoSet = {points: new Map(), ranges: new Map()}
    for (let src of state.facet(Decoration.Point.source)) set.points.set(src, src(state))
    for (let src of state.facet(Decoration.Range.source)) set.ranges.set(src, src(state))
    return set
}

/**
 * Given prev/next deco sets and the document change sections, produce a
 * section array marking spans that need re-render (`ins == -2`).
 */
export function findChangedRanges(
    prevState: EditorState,
    prevDeco: DecoSet,
    state: EditorState,
    deco: DecoSet,
    sections: ChangeSet.Sections,
) {
    let result: number[] = []
    let globalChange =
        compareGlobal(prevState, state, tagShape) ||
        compareGlobal(prevState, state, tagWidget) ||
        compareGlobal(prevState, state, tagWrapper) ||
        compareGlobal(prevState, state, tagAttribute)

    let shapeChanges: number[] = []
    for (let i = 0, posA = 0, posB = 0; i < sections.length;) {
        let len = sections[i++],
            ins = sections[i++]
        if (ins == -1 && globalChange) {
            addSection(result, len, -2)
        } else if (ins == -1) {
            let cur: number[] = [],
                curPos = 0,
                ranges: number[][] = [cur]
            let add = (from: number, to: number) => {
                if (from < curPos) {
                    ranges.push((cur = []))
                    curPos = 0
                }
                addRange(cur, from, to)
            }
            compareDecoSet(prevDeco.ranges, deco.ranges, (a, b) => {
                ;(a || RangeSet.empty).compareRange(posA, b || RangeSet.empty, posB, len, add)
            })
            compareDecoSet(prevDeco.points, deco.points, (a, b) => {
                ;(a || PointSet.empty).compareRange(posA, b || PointSet.empty, posB, len, (pos, val) => {
                    add(pos, pos + 1)
                    if (val instanceof ShapeDecoration) {
                        if (!globalChange) shapeChanges.push(pos)
                    }
                })
            })
            let joined = joinRanges(ranges),
                pos = posB,
                end = pos + len
            for (let i = 0; i < joined.length;) {
                let from = Math.max(pos, joined[i++]),
                    to = Math.min(end, joined[i++])
                if (from > pos) addSection(result, from - pos, -1)
                if (from < to) addSection(result, to - from, -2)
                pos = to
            }
            if (pos < end) addSection(result, end - pos, -1)
            posA += len
            posB += len
        } else {
            posA += len
            posB += ins < 0 ? len : ins
            addSection(result, len, ins)
        }
    }
    if (shapeChanges.length) return addAtomicityChanges(result, prevState, shapeChanges)
    return result
}

/**
 * Expand dirty points that sit on atomic nodes to the full node span so
 * shape decorations replace whole atoms rather than partial interiors.
 */
export function addAtomicityChanges(sections: number[], prev: EditorState, changes: number[]): ChangeSet.Sections {
    let added: number[] = []
    let scan = prev.doc.resolve(0),
        last = -1,
        sectionPos = 0,
        sectionI = 0,
        off = 0
    for (let posB of changes.sort()) {
        if (posB == last) continue
        last = posB
        while (posB >= sectionPos) {
            let len = sections[sectionI++],
                ins = sections[sectionI++]
            if (ins < 0) {
                sectionPos += len
            } else {
                sectionPos += ins
                off += len - ins
            }
        }
        let posA = posB - off
        if (scan.pos < posA) scan = scan.advance(posA - scan.pos)
        let node = scan.nodeAfter
        if (!node) continue
        added.push(posA, posA + node.length)
    }
    if (!added.length) return sections

    let changedSections = [],
        pos = 0
    for (let i = 0; i < added.length;) {
        let from = added[i++],
            to = added[i++]
        if (from > pos) changedSections.push(from - pos, -1)
        changedSections.push(to - from, to - from)
        pos = to
    }
    if (pos < prev.doc.length) changedSections.push(prev.doc.length - pos, -1)
    return ChangeSet.composeSections(changedSections, sections)
}

/** Append a section, coalescing with the previous pair when `ins` matches. */
export function addSection(sections: number[], len: number, ins: number) {
    let last = sections.length - 1
    if (last >= 0) {
        let lastIns = sections[last]
        if (lastIns >= 0 && ins >= 0) {
            sections[last - 1] += len
            sections[last] += ins
            return
        }
        if (lastIns < 0 && lastIns == ins) {
            sections[last - 1] += len
            return
        }
    }
    sections.push(len, ins)
}
