/**
 * Spec → ChangeSet construction (mark ranges, replaces, compose chain).
 */
import {ValidationError} from "../util/error"
import {subtractSet} from "../model/mark/set"
import type {Node, Plot} from "../model/node"
import {Slice} from "../model/slice"
import type {Modification} from "./modification"
import {ChangeSet} from "./change"
import {fitReplacement} from "./fit"
import {transform} from "./transform"
import type {SectionData} from "./sections"
import {addSection} from "./sections"

class ChangeSetBuilder {
    sections: number[] = []
    data: SectionData[] = []
    pos = 0

    constructor(readonly docLen: number) {}
}


// ---------------------------------------------------------------------------
// Spec → ChangeSet construction (mark ranges, replaces, compose chain)
// ---------------------------------------------------------------------------
export function createChangeSet(doc: Plot.Doc, spec: ChangeSet.Spec, mayCorrect = true): ChangeSet {
    let cur: ChangeSetBuilder | null = null
    let accum: ChangeSet | null = null
    let doCorrect = false

    let flush = () => {
        if (cur) {
            if (cur.pos < cur.docLen) addSection(cur.sections, cur.data, cur.docLen - cur.pos, -1, null)
            push(ChangeSet.new(cur.sections, cur.data))
            cur = null
        }
    }
    let push = (set: ChangeSet) => {
        accum = accum ? accum.compose(transform(set, accum, doc, false, false).set) : set
    }
    let section = (from: number, to: number, ins: number, value: SectionData) => {
        if (!cur || from < cur.pos) {
            flush()
            cur = new ChangeSetBuilder(doc.length)
        }
        if (from > cur.pos) addSection(cur.sections, cur.data, from - cur.pos, -1, null)
        addSection(cur.sections, cur.data, to - from, ins, value)
        cur.pos = to
    }

    let build = (spec: ChangeSet.Spec) => {
        if (Array.isArray(spec)) {
            for (let elt of spec) build(elt)
        } else if (spec instanceof ChangeSet) {
            flush()
            push(spec)
        } else if ("correct" in spec) {
            flush()
            let {correct, local} = spec
            let inner = createChangeSet(doc, correct, false)
            push(mayCorrect || local ? inner.correct(doc, local) : inner)
        } else {
            let {from, to, add, remove, insert, fit} = spec as ChangeSet.Change
            let modifies = add || remove
            if (modifies) {
                if (insert)
                    throw new ValidationError(
                        `A Change object cannot both ${add ? "add" : "remove"} a mark and replace a range`,
                    )
                if (to == null) to = from + 1
                if (add) {
                    let mods: Modification[] = [{add}]
                    markableSections(doc, from, to, add.type.spanning, (node, from, to) => {
                        if (!doc.schema.markAllowed(add.type, node.type)) return false
                        let has = add.type.isInSet(node.tag.marks)
                        if (add.type.set) {
                            let modsHere = mods
                            if (has) {
                                let left = subtractSet(add.value as any[], has.value as any[], add.type.set)
                                if (!left.length) return false
                                modsHere = [{add: add.type.of(left)}]
                            }
                            section(from, to, -2, modsHere)
                        } else if (!has || !has.eq(add)) {
                            section(from, to, -2, mods)
                        }
                        return true
                    })
                }
                if (remove) {
                    let mods: Modification[] = [{remove}]
                    markableSections(doc, from, to, remove.type.spanning, (node, from, to) => {
                        const has = remove.isInSet(node.tag.marks)
                        if (!has || !doc.schema.markAllowed(remove.type, node.type)) return false
                        let modsHere = mods
                        if (remove.type.set) {
                            let left = subtractSet(remove.value as any[], has.value as any[], remove.type.set!)
                            if (!left.length) return false
                            modsHere = [{remove: remove.type.of(left)}]
                        }
                        section(from, to, -2, modsHere)
                        return true
                    })
                }
            } else {
                if (to == null) to = from
                insert = (!insert ? Slice.empty : Array.isArray(insert) ? Slice.of(insert) : insert) as Slice
                if (to <= from) to = from
                if (fit) {
                    doCorrect = true
                    ;({
                        from,
                        to,
                        slice: insert,
                    } = fitReplacement(doc, doc.resolve(from), doc.resolve(to), insert, fit === true ? [] : fit))
                }
                if (insert.length || to != from) section(from, to, insert.length, insert)
            }
        }
    }
    build(spec)
    flush()
    // `accum` is assigned only inside nested helpers; cast for control-flow
    let set = accum as ChangeSet | null
    if (!set) return ChangeSet.empty(doc.length)
    return doCorrect && mayCorrect ? set.correct(doc) : set
}

function markableSections(
    doc: Plot.Doc,
    from: number,
    to: number,
    spanning: boolean,
    f: (n: Node, from: number, to: number) => boolean,
) {
    doc.iterate(from, to, (node, pos) => {
        if ((pos >= from && pos + (spanning ? node.length : 1) <= to) || node.isText) {
            if (node.isText ? f(node, Math.max(pos, from), Math.min(pos + node.length, to)) : f(node, pos, pos + 1))
                return false
        }
    })
}

