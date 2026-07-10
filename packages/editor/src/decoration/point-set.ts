/**
 * Sorted set of point decorations (zero-width markers at document positions).
 * Points are ordered by position, then by {@link PointSet.Value.side}.
 */
import type {ChangeSet} from "@arrisa/doc"

/** First index in a sorted number array whose value is strictly greater than `n`. */
export function findAbove(array: readonly number[], start: number, n: number) {
    let from = start,
        to = array.length
    for (;;) {
        if (from == to) return from
        let mid = (from + to) >> 1
        if (array[mid] > n) to = mid
        else from = mid + 1
    }
}

const none: readonly any[] = []

export class PointSet<T extends PointSet.Value = PointSet.Value> {
    static empty: PointSet<any> = new PointSet(none, none)

    private constructor(
        readonly values: readonly T[],

        readonly positions: readonly number[],
    ) {}

    get length() {
        return this.positions.length
    }

    /**
     * Build a set from ordered (or mostly ordered) point additions.
     * Out-of-order inserts are supported by shifting into place.
     */
    static create<T extends PointSet.Value>(
        source: Iterable<[number, T]> | ((add: (pos: number, value: T) => void) => void),
    ): PointSet<T> {
        if (typeof source != "function") {
            let array = source
            source = (add) => {
                for (let [pos, value] of array) add(pos, value)
            }
        }
        let positions: number[] = [],
            values: T[] = [],
            curPos = -1,
            curVal: T | undefined
        source((pos: number, value: T) => {
            if (curPos > pos || (curPos == pos && curVal!.side > value.side)) {
                // Insert into sorted order by shifting the tail right.
                let i = positions.length
                while (i > 0 && (positions[i - 1] - pos || values[i - 1].side - value.side) > 0) {
                    positions[i] = positions[i - 1]
                    values[i] = values[i - 1]
                    i--
                }
                positions[i] = pos
                values[i] = value
            } else {
                positions.push(pos)
                values.push(value)
                curPos = pos
                curVal = value
            }
        })
        return new PointSet(values, positions)
    }

    /** Map positions through a document change set; drops points that map to null. */
    map(changes: ChangeSet) {
        if (changes.empty) return this
        let positions = this.positions.slice()
        let pos = 0,
            i = 0
        let deleted: number[] = [],
            deletions = 0
        changes.iterGaps(
            (fromA, toA, fromB) => {
                let off = fromB - fromA,
                    end = toA - 1
                if (end > pos) {
                    let nextI = findAbove(positions, i, end)
                    if (off) for (; i < nextI; i++) positions[i] += off
                    else i = nextI
                    pos = end
                }
            },
            (_fromA, toA) => {
                let nextI = findAbove(positions, i, toA + 1)
                for (; i < nextI; i++) {
                    let mapped = changes.mapPos(
                        positions[i],
                        this.values[i].side < 0 ? -1 : 1,
                        this.values[i].trackMode,
                    )
                    if (mapped == null) {
                        addDel(deleted, i)
                        deletions++
                    } else positions[i] = mapped
                }
                pos = toA + 1
            },
        )
        if (!deletions) return new PointSet<T>(this.values, positions)
        return new PointSet<T>(applyDel(deleted, deletions, this.values), applyDel(deleted, deletions, positions))
    }

    /** Merge two ordered sets, preferring `other` when position and side tie. */
    merge(other: PointSet<T>) {
        if (!this.length) return other
        if (!other.length) return this
        let posA = this.positions,
            posB = other.positions
        let pos: number[] = new Array(posA.length + posB.length),
            values: T[] = new Array(pos.length)
        for (let i = 0, a = 0, b = 0; ;) {
            let nextA = a < posA.length ? posA[a] : 1e9
            let nextB = b < posB.length ? posB[b] : 1e9
            if (nextA == 1e9 && nextB == 1e9) return new PointSet<T>(values, pos)
            let cmp =
                nextA - nextB ||
                (nextA < 1e9 && nextB < 1e9 ? this.values[a].side - other.values[b].side : 0)
            if (cmp < 0) {
                pos[i] = posA[a]
                values[i++] = this.values[a++]
            } else {
                pos[i] = posB[b]
                values[i++] = other.values[b++]
            }
        }
    }

    /**
     * Report positions where this set and `b` differ over a kept document range
     * of length `len` starting at `fromA` / `fromB`.
     */
    compareRange(fromA: number, b: PointSet<T>, fromB: number, len: number, change: (pos: number, val: T) => void) {
        let a = this,
            endB = fromB + len
        if (a != b || fromA != fromB) {
            let iA = findAbove(a.positions, 0, fromA - 1),
                lA = a.positions.length
            let iB = findAbove(b.positions, 0, fromB - 1),
                lB = b.positions.length
            let off = fromB - fromA
            let sameVal = a.values == b.values
            for (;;) {
                let nextA = iA < lA ? a.positions[iA] + off : 1e9
                let nextB = iB < lB ? b.positions[iB] : 1e9
                let next = Math.min(nextA, nextB)
                if (next > endB) break
                if (nextA == nextB) {
                    if (!sameVal && !a.values[iA].eq(b.values[iB])) change(next, a.values[iA])
                    iA++
                    iB++
                } else if (nextA < nextB) {
                    change(nextA, a.values[iA++])
                } else {
                    change(nextB, b.values[iB++])
                }
            }
        }
    }

    iter(): PointIterator<T> {
        return new PointIterator<T>(this)
    }

    at(pos: number): T | undefined {
        let index = findAbove(this.positions, 0, pos - 1)
        return index < this.positions.length && this.positions[index] == pos ? this.values[index] : undefined
    }
}

export namespace PointSet {
    export interface Value {
        side: number

        trackMode: ChangeSet.TrackMode | undefined

        eq(other: PointSet.Value): boolean
    }
}

export class PointIterator<T extends PointSet.Value> {
    declare value: T | null
    done = false
    declare pos: number
    declare i: number

    constructor(readonly set: PointSet<T>) {
        this.fill(0)
    }

    get side() {
        return this.done ? 1 : this.value!.side
    }

    next() {
        if (!this.done) this.fill(this.i + 1)
    }

    goto(pos: number) {
        this.done = false
        this.fill(findAbove(this.set.positions, 0, pos - 1))
    }

    private fill(i: number) {
        this.i = i
        if (i < this.set.positions.length) {
            this.pos = this.set.positions[i]
            this.value = this.set.values[i]
        } else {
            this.pos = 1e8
            this.value = null
            this.done = true
        }
    }
}

/** Record a half-open index range `[i, i+1)` into a packed deletion list, merging adjacent spans. */
export function addDel(deleted: number[], i: number) {
    let last = deleted.length - 1
    if (last >= 0 && deleted[last] == i) deleted[last] = i + 1
    else deleted.push(i, i + 1)
}

/** Drop entries whose indices fall in `deleted` (packed [from,to) pairs). */
export function applyDel<T>(deleted: number[], deletions: number, array: readonly T[]): T[] {
    let result = new Array(array.length - deletions)
    for (let iA = 0, iR = 0, iD = 0; ;) {
        let last = iD == deleted.length,
            from = last ? array.length : deleted[iD++]
        while (iA < from) result[iR++] = array[iA++]
        if (last) return result
        let to = deleted[iD++]
        iA += to - from
    }
}
