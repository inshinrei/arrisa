/**
 * Low-level change-set section encoding helpers.
 *
 * Section encoding: flat `sections` array of `[lenA, ins, lenA, ins, …]` where
 * `ins < 0` means keep (`-1` plain, `-2` with mark modifications in `data`),
 * and `ins >= 0` means replace `lenA` with a slice of length `ins`.
 */
import {compareModifications, type Modification} from "./modification"
import {Slice} from "../model/slice"
import type {ChangeSet} from "./change"

export type SectionData = Slice | readonly Modification[] | null

export class SectionIter {
    i = 0
    len!: number
    off!: number
    ins!: number

    constructor(
        readonly sections: ChangeSet.Sections,
        readonly data?: readonly SectionData[],
    ) {
        this.next()
    }

    get keep() {
        return this.ins == -1 || this.ins == -2
    }

    get done() {
        return this.ins == -3
    }

    get len2() {
        return this.ins < 0 ? this.len : this.ins
    }

    get mods() {
        return this.data ? (this.data[(this.i - 2) >> 1] as readonly Modification[] | null) : null
    }

    get slice() {
        return this.data ? (this.data[(this.i - 2) >> 1] as Slice) : Slice.empty
    }

    next() {
        let {sections} = this
        if (this.i < sections.length) {
            this.len = sections[this.i++]
            this.ins = sections[this.i++]
        } else {
            this.len = 0
            this.ins = -3
        }
        this.off = 0
    }

    slicePart(len?: number) {
        return this.slice.slice(this.off, len == null ? undefined : this.off + len)
    }

    forward(len: number) {
        if (len == this.len) this.next()
        else {
            this.len -= len
            this.off += len
        }
    }

    forward2(len: number) {
        if (this.keep) this.forward(len)
        else if (len == this.ins) this.next()
        else {
            this.ins -= len
            this.off += len
        }
    }
}

export function addSection(
    sections: number[],
    data: SectionData[] | null,
    len: number,
    ins: number,
    value: SectionData,
    forceJoin = false,
) {
    if (len == 0 && ins <= 0) return
    let last = sections.length - 2
    if (last >= 0 && ins <= 0 && ins == sections[last + 1]) {
        let lastValue = data ? data[data.length - 1] : null
        let match =
            ins == 0
                ? true
                : value
                  ? lastValue &&
                    compareModifications(lastValue as readonly Modification[], value as readonly Modification[])
                  : !lastValue
        if (match) {
            sections[last] += len
            return
        }
    }
    if (forceJoin || (last >= 0 && len == 0 && sections[last] == 0)) {
        sections[last] += len
        sections[last + 1] += ins
        if (data) data[data.length - 1] = (data[data.length - 1] as Slice).concat(value as Slice)
    } else {
        sections.push(len, ins)
        if (data) data.push(value)
    }
}

