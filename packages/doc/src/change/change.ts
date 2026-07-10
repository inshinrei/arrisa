/**
 * Change sets: length-preserving document transforms composed of
 * preserved spans (optional mark mods) and replace spans (slices).
 *
 * Section encoding: flat `sections` array of `[lenA, ins, lenA, ins, …]` where
 * `ins < 0` means keep (`-1` plain, `-2` with mark modifications in `data`),
 * and `ins >= 0` means replace `lenA` with a slice of length `ins`.
 *
 * Submodules:
 * - {@link ./modification} mark add/remove helpers
 * - {@link ./create} spec → ChangeSet construction
 * - {@link ./transform} OT transform + compose
 * - {@link ./fit} structure fitting / correction
 * - {@link ./sections} section encoding helpers
 */
import {ValidationError} from "../util/error"
import {Mark} from "../model/mark"
import {Node, Plot} from "../model/node"
import {Slice, Token} from "../model/slice"
import type {Schema} from "../schema/schema"
import {
    type Modification,
    type ModificationJSON,
    isAdd,
    modificationToJSON,
    modificationFromJSON,
    compareModifications,
    invertMods,
} from "./modification"
import {Builder} from "./builder"
import {createChangeSet} from "./create"
import {compose, transform} from "./transform"
import {ChangeFitter} from "./fit"
import type {SectionData} from "./sections"
import {addSection} from "./sections"

export type {Modification, ModificationJSON} from "./modification"
export {applyModifications, isAdd, isRemove} from "./modification"
export type {SectionData} from "./sections"

function isNatNum(value: any): value is number {
    return typeof value == "number" && Math.floor(value) == value && value >= 0
}

// ---------------------------------------------------------------------------
// ChangeSet public API
// ---------------------------------------------------------------------------
const applyCache = new WeakMap<ChangeSet, {a: Plot.Doc; b: Plot.Doc}>()

export class ChangeSet {
    private constructor(
        readonly sections: ChangeSet.Sections,
        readonly data: readonly SectionData[],
    ) {}

    private _length = -1

    get length() {
        if (this._length < 0) {
            this._length = 0
            for (let i = 0; i < this.sections.length; i += 2) this._length += this.sections[i]
        }
        return this._length
    }

    private _newLength = -1

    get newLength() {
        if (this._newLength < 0) {
            this._newLength = 0
            for (let i = 0; i < this.sections.length; i += 2) {
                let ins = this.sections[i + 1]
                this._newLength += ins < 0 ? this.sections[i] : ins
            }
        }
        return this._newLength
    }

    get empty() {
        return this.sections.length == 0 || (this.sections.length == 2 && this.sections[1] < 0)
    }

    static new(sections: ChangeSet.Sections, data: readonly SectionData[]) {
        return new ChangeSet(sections, data)
    }

    static fromJSON(schema: Schema, json: ChangeSet.JSON) {
        if (!Array.isArray(json)) throw new ValidationError("Invalid ChangeSet JSON")
        let sections: number[] = [],
            data: SectionData[] = []
        for (let elt of json) {
            if (isNatNum(elt)) {
                sections.push(elt, -1)
                data.push(null)
            } else {
                if (!Array.isArray(elt) || elt.length != 2 || !isNatNum(elt[0]) || !Array.isArray(elt[1]))
                    throw new ValidationError("Invalid ChangeSet JSON")
                let [len, val] = elt
                if (val.length && typeof val[0] == "object" && val[0] && ("add" in val[0] || "remove" in val[0])) {
                    sections.push(len, -2)
                    data.push(val.map((m) => modificationFromJSON(schema, m)))
                } else {
                    let slice = Slice.fromJSON(schema, val)
                    sections.push(len, slice.length)
                    data.push(slice)
                }
            }
        }
        return new ChangeSet(sections, data)
    }

    static create(doc: Plot.Doc, spec: ChangeSet.Spec): ChangeSet {
        return createChangeSet(doc, spec)
    }

    static empty(length: number) {
        return length ? new ChangeSet([length, -1], [null]) : new ChangeSet([], [])
    }

    static composeSections(a: ChangeSet.Sections, b: ChangeSet.Sections): ChangeSet.Sections {
        return compose(a, b).sections
    }

    static transform(doc: Plot.Doc, a: ChangeSet, b: ChangeSet) {
        let {set: mA, fix} = transform(a, b, doc, true, true)
        let mB = transform(b, a, doc, false, false).set
        return fix ? {a: mA.compose(fix), b: mB.compose(fix)} : {a: mA, b: mB}
    }

    eq(other: ChangeSet) {
        if (other.sections.length != this.sections.length) return false
        for (let i = 0; i < this.sections.length; i++) if (this.sections[i] != other.sections[i]) return false
        for (let i = 0; i < this.data.length; i++) {
            let a = this.data[i] as any,
                b = (other as ChangeSet).data[i] as any
            if (a && !(this.sections[(i << 1) + 1] < 0 ? compareModifications(a, b) : a.eq(b))) return false
        }
        return true
    }

    apply(doc: Plot.Doc) {
        if (this.length != doc.length)
            throw new ValidationError(`Trying to apply change of length ${this.length} to doc of length ${doc.length}`)
        if (this.empty) return doc
        let cached = applyCache.get(this)
        if (cached && doc.eq(cached.a)) return cached.b

        let builder = new Builder(doc)
        let cursor = doc.resolve(0)
        for (let i = 0, iS = 0; i < this.data.length; i++) {
            let lenA = this.sections[iS++],
                lenB = this.sections[iS++]
            if (lenB < 0) {
                builder.modifications = this.data[i] as null | readonly Modification[]
                cursor = cursor.advance(lenA, builder)
                builder.modifications = null
            } else {
                cursor = cursor.advance(lenA)
                ;(this.data[i] as Slice).run(builder)
            }
        }
        if (cursor.pos != doc.length) throw new ValidationError("Change doesn't cover the entire document")

        let newDoc = builder.finish()
        applyCache.set(this, {a: doc, b: newDoc})
        return newDoc
    }

    toJSON(): ChangeSet.JSON {
        let result: (number | [number, Slice.JSON | readonly ModificationJSON[]])[] = []
        for (let i = 0; i < this.data.length; i++) {
            let len = this.sections[i << 1],
                ins = this.sections[(i << 1) + 1]
            if (ins == -1) result.push(len)
            else if (ins == -2) result.push([len, (this.data[i] as readonly Modification[]).map(modificationToJSON)])
            else result.push([len, (this.data[i] as Slice).toJSON()])
        }
        return result
    }

    transform(doc: Plot.Doc, other: ChangeSet, before: boolean = false): ChangeSet {
        let {set, fix} = transform(this, other, doc, before, true)
        return fix ? set.compose(fix) : set
    }

    compose(other: ChangeSet): ChangeSet {
        let {sections, data} = compose(this.sections, other.sections, this.data, other.data)
        return new ChangeSet(sections, data!)
    }

    invert(doc: Plot.Doc) {
        let sections: number[] = [],
            data: SectionData[] = []
        for (let i = 0, iS = 0, pos = 0; iS < this.sections.length; iS += 2, i++) {
            let len = this.sections[iS],
                ins = this.sections[iS + 1]
            if (ins >= 0) {
                addSection(sections, data, ins, len, doc.slice(pos, pos + len))
            } else {
                let mods = this.data[i] as readonly Modification[] | null
                let at = pos,
                    end = pos + len
                if (mods)
                    doc.iterate(pos, end, (node, nodePos) => {
                        if (node.isLeaf || (nodePos >= pos && nodePos < end)) {
                            let [from, to] = node.isText
                                ? [Math.max(at, nodePos), Math.min(end, nodePos + node.length)]
                                : [nodePos, nodePos + 1]
                            if (at < from) addSection(sections, data, from - at, -1, null)
                            addSection(sections, data, to - from, -2, invertMods(mods!, node.tag))
                            at = to
                        }
                    })
                if (at < end) addSection(sections, data, end - at, -1, null)
            }
            pos += len
        }
        return new ChangeSet(sections, data)
    }

    correct(doc: Plot.Doc, local = false) {
        let fitter = new ChangeFitter(doc, local)
        for (let i = 0, iS = 0, pos = 0; i < this.data.length; i++) {
            let len = this.sections[iS++],
                ins = this.sections[iS++]
            if (ins < 0) fitter.preserved(pos, (pos += len))
            else fitter.replaced(this.data[i] as Slice, pos, (pos += len))
        }
        let fit = fitter.finish()
        return fit ? this.compose(fit) : this
    }

    mapPos(pos: number, assoc?: -1 | 1): number

    mapPos(pos: number, assoc: -1 | 1, track?: ChangeSet.TrackMode): number | null

    mapPos(pos: number, assoc = -1, track?: ChangeSet.TrackMode) {
        let posA = 0,
            posB = 0
        for (let i = 0; i < this.sections.length;) {
            let len = this.sections[i++],
                type = this.sections[i++],
                endA = posA + len
            if (type < 0) {
                if (endA > pos) return posB + (pos - posA)
                posB += len
            } else {
                if (
                    track &&
                    endA >= pos &&
                    ((track == "around" && posA < pos && endA > pos) ||
                        (track == "before" && posA < pos) ||
                        (track == "after" && endA > pos))
                )
                    return null
                if (endA > pos || (endA == pos && assoc < 0 && !len))
                    return pos == posA || assoc < 0 ? posB : posB + type
                posB += type
            }
            posA = endA
        }
        if (pos > posA) throw new RangeError(`Position ${pos} is out of range for changeset of length ${posA}`)
        return posB
    }

    findInserted(pred: (tag: Node.Tag) => boolean): number | null {
        let found: number | null = null
        this.iterChanges((_f, _t, pos, _to, inserted) => {
            if (found != null) return
            for (let tok of inserted.content) {
                if (tok.tokenType == Token.Type.Node) {
                    if (pred(tok.tag)) return (found = pos)
                    pos += tok.length
                } else {
                    if (tok.tokenType == Token.Type.Open && pred(tok)) return (found = pos)
                    pos++
                }
            }
        })
        return found
    }

    touchesRange(from: number, to: number) {
        for (let i = 0, pos = 0; i < this.sections.length && pos <= to;) {
            let len = this.sections[i++],
                ins = this.sections[i++],
                end = pos + len
            if (ins >= 0 && pos <= to && end >= from) return pos < from && end > to ? "cover" : true
            pos = end
        }
        return false
    }

    iterChanges(
        replaced: (fromA: number, toA: number, fromB: number, toB: number, inserted: Slice) => void,
        preserved?: (
            fromA: number,
            toA: number,
            fromB: number,
            toB: number,
            modifications: readonly Modification[] | null,
        ) => void,
    ) {
        for (let posA = 0, posB = 0, i = 0, iS = 0; i < this.data.length;) {
            let len = this.sections[iS++],
                ins = this.sections[iS++],
                data = this.data[i++]
            if (ins < 0) {
                if (preserved) preserved(posA, posA + len, posB, posB + len, data as any)
                posA += len
                posB += len
            } else {
                replaced(posA, (posA += len), posB, (posB += ins), data as Slice)
            }
        }
    }

    iterGaps(
        gap: (fromA: number, toA: number, fromB: number, toB: number) => void,
        change?: (fromA: number, toA: number, fromB: number, toB: number) => void,
    ) {
        for (let i = 0, posA = 0, posB = 0; i < this.sections.length;) {
            let len = this.sections[i++],
                ins = this.sections[i++]
            if (ins < 0) {
                while (i < this.sections.length && this.sections[i + 1] < 0) {
                    len += this.sections[i]
                    i += 2
                }
                gap(posA, posA + len, posB, posB + len)
                posB += len
            } else {
                while (i < this.sections.length && this.sections[i + 1] >= 0) {
                    len += this.sections[i++]
                    ins += this.sections[i++]
                }
                if (change) change(posA, posA + len, posB, posB + ins)
                posB += ins
            }
            posA += len
        }
    }

    iterChangedRanges(range: (fromA: number, toA: number, fromB: number, toB: number) => void) {
        for (let i = 0, posA = 0, posB = 0; i < this.sections.length;) {
            let len = this.sections[i++],
                ins = this.sections[i++]
            if (ins == -1) {
                posB += len
            } else {
                if (ins == -2) ins = len
                while (i < this.sections.length && this.sections[i + 1] != -1) {
                    let addLen = this.sections[i++],
                        addIns = this.sections[i++]
                    len += addLen
                    ins += addIns == -2 ? addLen : addIns
                }
                range(posA, posA + len, posB, posB + ins)
                posB += ins
            }
            posA += len
        }
    }

    toString() {
        let result = ""
        for (let i = 0, iS = 0, pos = 0; i < this.data.length; i++) {
            let len = this.sections[iS++],
                ins = this.sections[iS++],
                data = this.data[i]
            let text = ""
            if (ins >= 0) {
                text += data
            } else if (data) {
                text += `[${(data as readonly Modification[]).map((mod) => {
                    return `${isAdd(mod) ? "+" + mod.add : "-" + mod.remove}`
                })}]`
            }
            if (text) result += `${result ? "," : ""}${pos}${len ? `-${pos + len}` : ""}${text}`
            pos += len
        }
        return result
    }
}

export namespace ChangeSet {
    export type Change = {
        from: number
        to?: number
        insert?: Slice | readonly Token[]
        fit?: boolean | readonly Plot.Tag[]
        add?: Mark
        remove?: Mark
    }

    export type Spec =
        ChangeSet.Change | {correct: ChangeSet.Spec; local?: boolean} | ChangeSet | readonly ChangeSet.Spec[]

    export type Sections = readonly number[]

    export type JSON = readonly (number | [number, Slice.JSON | readonly ModificationJSON[]])[]

    export type TrackMode = "before" | "after" | "around"
}

