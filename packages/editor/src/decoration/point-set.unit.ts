import {describe, expect, it} from "vitest"
import {ChangeSet, Leaf, Plot, Schema} from "@arrisa/doc"
import {PointSet, findAbove, addDel, applyDel} from "./point-set"

class V implements PointSet.Value {
    constructor(
        readonly id: string,
        readonly side: number = 0,
        readonly trackMode: ChangeSet.TrackMode | undefined = "around",
    ) {}
    eq(other: PointSet.Value): boolean {
        return other instanceof V && other.id == this.id && other.side == this.side
    }
}

function basicDoc() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph])
    return schema.doc([paragraph.create([Leaf.text("hello")])])
}

describe("findAbove", () => {
    it("returns first index strictly greater than n", () => {
        let a = [1, 3, 5, 7]
        expect(findAbove(a, 0, 0)).toBe(0)
        expect(findAbove(a, 0, 1)).toBe(1)
        expect(findAbove(a, 0, 4)).toBe(2)
        expect(findAbove(a, 0, 7)).toBe(4)
        expect(findAbove(a, 0, 100)).toBe(4)
    })
})

describe("PointSet.create", () => {
    it("builds from ordered pairs", () => {
        let set = PointSet.create([
            [1, new V("a")],
            [3, new V("b")],
            [5, new V("c")],
        ])
        expect(set.length).toBe(3)
        expect(set.positions).toEqual([1, 3, 5])
        expect(set.at(3)?.id).toBe("b")
        expect(set.at(2)).toBeUndefined()
    })

    it("inserts out-of-order points", () => {
        let set = PointSet.create((add) => {
            add(5, new V("late"))
            add(1, new V("early"))
            add(3, new V("mid"))
        })
        expect(set.positions).toEqual([1, 3, 5])
        expect(set.values.map((v) => (v as V).id)).toEqual(["early", "mid", "late"])
    })

    it("orders same-position points by side", () => {
        let set = PointSet.create((add) => {
            add(2, new V("right", 1))
            add(2, new V("left", -1))
        })
        expect(set.values.map((v) => (v as V).id)).toEqual(["left", "right"])
    })
})

describe("PointSet.merge", () => {
    it("merges two ordered sets", () => {
        let a = PointSet.create([
            [1, new V("a")],
            [4, new V("d")],
        ])
        let b = PointSet.create([
            [2, new V("b")],
            [3, new V("c")],
        ])
        let m = a.merge(b)
        expect(m.positions).toEqual([1, 2, 3, 4])
        expect(m.values.map((v) => (v as V).id)).toEqual(["a", "b", "c", "d"])
    })

    it("returns the other set when empty", () => {
        let a = PointSet.create([[1, new V("a")]])
        expect(PointSet.empty.merge(a)).toBe(a)
        expect(a.merge(PointSet.empty)).toBe(a)
    })
})

describe("PointSet.map", () => {
    it("shifts points past an insertion", () => {
        let doc = basicDoc()
        // positions: 0 open, 1..5 text, 6 close
        let set = PointSet.create([
            [1, new V("start")],
            [4, new V("mid")],
            [6, new V("end")],
        ])
        let change = ChangeSet.create(doc, {from: 2, to: 2, insert: [Leaf.text("X")]})
        let mapped = set.map(change)
        expect(mapped.positions).toEqual([1, 5, 7])
    })

    it("returns this for empty changes", () => {
        let set = PointSet.create([[1, new V("a")]])
        expect(set.map(ChangeSet.empty(10))).toBe(set)
    })
})

describe("PointSet.compareRange", () => {
    it("reports positions that differ", () => {
        let a = PointSet.create([
            [1, new V("a")],
            [3, new V("b")],
        ])
        let b = PointSet.create([
            [1, new V("a")],
            [3, new V("c")],
            [5, new V("d")],
        ])
        let found: [number, string][] = []
        a.compareRange(0, b, 0, 10, (pos, val) => found.push([pos, (val as V).id]))
        expect(found).toEqual([
            [3, "b"],
            [5, "d"],
        ])
    })
})

describe("PointIterator", () => {
    it("iterates and supports goto", () => {
        let set = PointSet.create([
            [1, new V("a")],
            [4, new V("b")],
            [8, new V("c")],
        ])
        let it = set.iter()
        expect(it.done).toBe(false)
        expect(it.pos).toBe(1)
        it.next()
        expect(it.pos).toBe(4)
        it.goto(7)
        expect(it.pos).toBe(8)
        it.next()
        expect(it.done).toBe(true)
    })
})

describe("addDel / applyDel", () => {
    it("packs adjacent deletions and filters arrays", () => {
        let del: number[] = []
        addDel(del, 1)
        addDel(del, 2)
        addDel(del, 5)
        expect(del).toEqual([1, 3, 5, 6])
        expect(applyDel(del, 3, ["a", "b", "c", "d", "e", "f"])).toEqual(["a", "d", "e"])
    })
})
