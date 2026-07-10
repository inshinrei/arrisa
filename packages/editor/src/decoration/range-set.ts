/**
 * Sorted set of non-overlapping range decorations.
 * Ranges must be added in document order and must not overlap.
 */
import type {ChangeSet} from "@arrisa/doc"
import {findAbove, addDel, applyDel} from "./point-set"

const none: readonly any[] = []

export class RangeSet<T extends RangeSet.Value = RangeSet.Value> {
    static empty: RangeSet<any> = new RangeSet(none, none, none)

    private constructor(
        readonly values: readonly T[],

        readonly from: readonly number[],

        readonly to: readonly number[],
    ) {}

    get length() {
        return this.from.length
    }

    /** Build a set from ordered, non-empty, non-overlapping ranges. */
    static create<T extends RangeSet.Value>(
        source: Iterable<[number, number, T]> | ((add: (from: number, to: number, value: T) => void) => void),
    ): RangeSet<T> {
        if (typeof source != "function") {
            let array = source
            source = (add) => {
                for (let [from, to, value] of array) add(from, to, value)
            }
        }
        let from: number[] = [],
            to: number[] = [],
            values: T[] = [],
            curPos = -1
        source((f, t, value) => {
            if (f >= t) throw new Error("Ranges cannot be empty")
            if (f < curPos) throw new Error("Ranges must be added in order and cannot overlap")
            from.push(f)
            to.push(t)
            values.push(value)
            curPos = t
        })
        return new RangeSet<T>(values, from, to)
    }

    /** Map range endpoints through changes; drops ranges that collapse to empty. */
    map(changes: ChangeSet) {
        if (changes.empty || !this.length) return this
        let from = this.from.slice(),
            to = this.to.slice()
        let pos = 0,
            i = 0
        let deleted: number[] = [],
            deletions = 0
        changes.iterGaps(
            (fromA, toA, fromB) => {
                let off = fromB - fromA,
                    end = toA - 1
                if (end > pos) {
                    let nextI = findAbove(from, i, end)
                    if (off)
                        for (; i < nextI; i++) {
                            from[i] += off
                            to[i] += off
                        }
                    else i = nextI
                    pos = end
                }
            },
            (_fromA, toA) => {
                let nextI = findAbove(to, i, toA + 1)
                for (; i < nextI; i++) {
                    let value = this.values[i]
                    let mappedFrom = changes.mapPos(from[i], value.inclusiveStart ? -1 : 1)
                    let mappedTo = changes.mapPos(to[i], value.inclusiveEnd ? 1 : -1)
                    if (mappedFrom >= mappedTo) {
                        addDel(deleted, i)
                        deletions++
                    } else {
                        from[i] = mappedFrom
                        to[i] = mappedTo
                    }
                }
                pos = toA + 1
            },
        )
        if (!deletions) return new RangeSet<T>(this.values, from, to)
        return new RangeSet<T>(
            applyDel(deleted, deletions, this.values),
            applyDel(deleted, deletions, from),
            applyDel(deleted, deletions, to),
        )
    }

    iter(): RangeIterator<T> {
        return new RangeIterator<T>(this)
    }

    compareRange(
        fromA: number,
        b: RangeSet<T>,
        fromB: number,
        len: number,
        change: (from: number, to: number) => void,
    ) {
        let a = this,
            toB = fromB + len
        if (a != b || fromA != fromB) {
            let iA = findAbove(a.from, 0, fromA - 1),
                lA = a.from.length
            let iB = findAbove(b.from, 0, fromB - 1),
                lB = b.from.length
            let off = fromB - fromA
            let sameVals = a.values == b.values
            for (;;) {
                let [startA, endA] = iA < lA ? [a.from[iA] + off, a.to[iA] + off] : [1e9, 1e9]
                let [startB, endB] = iB < lB ? [b.from[iB], b.to[iB]] : [1e9, 1e9]
                let start = Math.min(startA, startB)
                if (start > toB) break
                if (startA == startB) {
                    if (endA != endB || (!sameVals && !a.values[iA].eq(b.values[iB])))
                        change(start, Math.max(endA, endB))
                    iA++
                    iB++
                } else if (startA < startB) {
                    change(startA, endA)
                    iA++
                } else {
                    change(startB, endB)
                    iB++
                }
            }
        }
    }
}

export namespace RangeSet {
    export interface Value {
        inclusiveStart: boolean

        inclusiveEnd: boolean

        eq(other: Value): boolean
    }
}

export class RangeIterator<T extends RangeSet.Value> {
    declare value: T | null
    declare from: number
    declare to: number
    done = false
    declare i: number

    constructor(readonly set: RangeSet<T>) {
        this.fill(0)
    }

    fill(i: number) {
        this.i = i
        if (i < this.set.from.length) {
            this.from = this.set.from[i]
            this.to = this.set.to[i]
            this.value = this.set.values[i]
        } else {
            this.from = this.to = 1e8
            this.value = null
            this.done = true
        }
    }

    next() {
        if (!this.done) this.fill(this.i + 1)
    }

    goto(pos: number) {
        this.done = false
        this.fill(findAbove(this.set.to, 0, pos))
    }
}

/** Append or merge a half-open range into a packed [from,to,from,to,...] list. */
export function addRange(ranges: number[], from: number, to: number) {
    let last = ranges.length - 1
    if (last < 0 || ranges[last] < from) ranges.push(from, to)
    else ranges[last] = Math.max(to, ranges[last])
}

/**
 * Merge multiple packed range lists (each ordered) into one ordered, coalesced list.
 * Used when concurrent decoration sources report overlapping dirty spans.
 */
export function joinRanges(ranges: number[][]) {
    if (ranges.length == 1) return ranges[0]
    let result: number[] = [],
        index = ranges.map(() => 0)
    for (;;) {
        let minI = -1,
            minFrom = -1
        for (let i = 0; i < ranges.length; i++) {
            let idx = index[i],
                set = ranges[i]
            if (idx < set.length && (minI < 0 || set[idx] < minFrom)) {
                minI = i
                minFrom = set[idx]
            }
        }
        if (minI < 0) return result
        let idx = index[minI],
            set = ranges[minI]
        addRange(result, set[idx], set[idx + 1])
        index[minI] += 2
    }
}
