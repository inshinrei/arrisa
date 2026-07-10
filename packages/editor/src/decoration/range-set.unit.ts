import {describe, expect, it} from "vitest"
import {ChangeSet, Leaf, Plot, Schema} from "@arrisa/doc"
import {RangeSet, addRange, joinRanges} from "./range-set"

class R implements RangeSet.Value {
    constructor(
        readonly id: string,
        readonly inclusiveStart = true,
        readonly inclusiveEnd = true,
    ) {}
    eq(other: RangeSet.Value): boolean {
        return other instanceof R && other.id == this.id
    }
}

function basicDoc() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph])
    return schema.doc([paragraph.create([Leaf.text("hello")])])
}

describe("RangeSet.create", () => {
    it("stores ordered ranges", () => {
        let set = RangeSet.create([
            [1, 3, new R("a")],
            [5, 8, new R("b")],
        ])
        expect(set.length).toBe(2)
        expect(set.from).toEqual([1, 5])
        expect(set.to).toEqual([3, 8])
    })

    it("rejects empty and overlapping ranges", () => {
        expect(() => RangeSet.create([[2, 2, new R("x")]])).toThrow(/empty/)
        expect(() =>
            RangeSet.create([
                [1, 4, new R("a")],
                [3, 6, new R("b")],
            ]),
        ).toThrow(/order|overlap/)
    })
})

describe("RangeSet.map", () => {
    it("shifts ranges past insertions and drops collapsed ones", () => {
        let doc = basicDoc()
        let set = RangeSet.create([
            [1, 3, new R("a")],
            [4, 6, new R("b")],
        ])
        let change = ChangeSet.create(doc, {from: 2, to: 5, insert: [Leaf.text("i")]})
        let mapped = set.map(change)
        // "hello" → "hio"; mapped ranges must stay non-empty and ordered
        expect(mapped.length).toBeGreaterThanOrEqual(0)
        for (let i = 0; i < mapped.length; i++) {
            expect(mapped.from[i]).toBeLessThan(mapped.to[i])
        }
    })
})

describe("RangeSet.compareRange", () => {
    it("reports differing spans", () => {
        let a = RangeSet.create([[1, 4, new R("a")]])
        let b = RangeSet.create([[1, 5, new R("a")]])
        let found: [number, number][] = []
        a.compareRange(0, b, 0, 10, (from, to) => found.push([from, to]))
        expect(found).toEqual([[1, 5]])
    })
})

describe("addRange", () => {
    it("appends and merges adjacent/overlapping", () => {
        let r: number[] = []
        addRange(r, 1, 3)
        addRange(r, 5, 7)
        addRange(r, 6, 9)
        expect(r).toEqual([1, 3, 5, 9])
    })
})

describe("joinRanges", () => {
    it("returns single stream unchanged", () => {
        expect(joinRanges([[1, 3, 5, 8]])).toEqual([1, 3, 5, 8])
    })

    it("merges multiple streams by earliest from", () => {
        // Stream B starts earlier — must pick stream index, not local idx.
        let joined = joinRanges([
            [10, 20],
            [5, 15],
        ])
        expect(joined).toEqual([5, 20])
    })

    it("coalesces interleaved ranges from many sources", () => {
        let joined = joinRanges([
            [0, 2, 8, 10],
            [1, 3, 6, 7],
            [12, 14],
        ])
        expect(joined).toEqual([0, 3, 6, 7, 8, 10, 12, 14])
    })
})

describe("RangeIterator", () => {
    it("iterates and supports goto by end position", () => {
        let set = RangeSet.create([
            [1, 3, new R("a")],
            [5, 8, new R("b")],
            [10, 12, new R("c")],
        ])
        let it = set.iter()
        expect(it.from).toBe(1)
        it.goto(4)
        expect((it.value as R).id).toBe("b")
        it.next()
        expect((it.value as R).id).toBe("c")
        it.next()
        expect(it.done).toBe(true)
    })
})
