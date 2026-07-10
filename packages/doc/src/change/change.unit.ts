import {describe, expect, it} from "vitest"
import {Schema} from "../schema/schema"
import {Mark} from "../model/mark"
import {Leaf, Plot} from "../model/node"
import {Slice} from "../model/slice"
import {ChangeSet} from "./change"

function basicSchema() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let bold = Mark.define("strong", {shape: {element: "strong"}})
    let em = Mark.define("em", {shape: {element: "em"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph, bold, em])
    return {schema, paragraph, bold, em}
}

describe("ChangeSet.empty / length", () => {
    it("represents empty and full-keep sets", () => {
        expect(ChangeSet.empty(0).empty).toBe(true)
        expect(ChangeSet.empty(0).length).toBe(0)
        expect(ChangeSet.empty(0).newLength).toBe(0)

        let keep = ChangeSet.empty(5)
        expect(keep.empty).toBe(true)
        expect(keep.length).toBe(5)
        expect(keep.newLength).toBe(5)
        expect(keep.sections).toEqual([5, -1])
    })
})

describe("ChangeSet.create + apply", () => {
    let {schema, paragraph, bold} = basicSchema()

    function doc(text: string) {
        return schema.doc([paragraph.create([Leaf.text(text)])])
    }

    it("replaces a text range", () => {
        // positions: 0 open, 1..5 "hello", 6 close  → length 7
        let d = doc("hello")
        expect(d.length).toBe(7)
        let change = ChangeSet.create(d, {from: 2, to: 5, insert: Slice.of([Leaf.text("i")])})
        let next = change.apply(d)
        expect((next.content[0] as Plot).textContent()).toBe("hio")
        expect(change.length).toBe(7)
        expect(change.newLength).toBe(5)
    })

    it("inserts at a point", () => {
        let d = doc("ab")
        let change = ChangeSet.create(d, {from: 2, to: 2, insert: Slice.of([Leaf.text("X")])})
        expect(change.apply(d).textContent()).toBe("aXb")
    })

    it("deletes a range", () => {
        let d = doc("abcd")
        let change = ChangeSet.create(d, {from: 2, to: 4, insert: Slice.empty})
        expect(change.apply(d).textContent()).toBe("ad")
    })

    it("adds a mark over text", () => {
        let d = doc("hi")
        let change = ChangeSet.create(d, {from: 1, to: 3, add: bold})
        let next = change.apply(d)
        let text = (next.content[0] as Plot).content[0] as Leaf<string>
        expect(text.param).toBe("hi")
        expect(text.marks.some((m) => m.eq(bold))).toBe(true)
    })

    it("removes a mark", () => {
        let d = schema.doc([paragraph.create([Leaf.text("hi", [bold])])])
        let change = ChangeSet.create(d, {from: 1, to: 3, remove: bold})
        let next = change.apply(d)
        let text = (next.content[0] as Plot).content[0] as Leaf<string>
        expect(text.marks).toEqual([])
    })

    it("rejects apply on length mismatch", () => {
        let d = doc("hi")
        let other = doc("hello")
        let change = ChangeSet.create(d, {from: 1, to: 2, insert: Slice.empty})
        expect(() => change.apply(other)).toThrow(/length/)
    })
})

describe("ChangeSet invert / compose / mapPos", () => {
    let {schema, paragraph} = basicSchema()

    function doc(text: string) {
        return schema.doc([paragraph.create([Leaf.text(text)])])
    }

    it("invert undoes a replace", () => {
        let d = doc("hello")
        let change = ChangeSet.create(d, {from: 1, to: 6, insert: Slice.of([Leaf.text("x")])})
        let next = change.apply(d)
        let back = change.invert(d).apply(next)
        expect(back.eq(d)).toBe(true)
    })

    it("compose chains sequential changes", () => {
        let d = doc("ab")
        // insert X after a → aXb
        let a = ChangeSet.create(d, {from: 2, to: 2, insert: Slice.of([Leaf.text("X")])})
        let mid = a.apply(d)
        // insert Y after X → aXYb
        let b = ChangeSet.create(mid, {from: 3, to: 3, insert: Slice.of([Leaf.text("Y")])})
        let composed = a.compose(b)
        expect(composed.apply(d).textContent()).toBe("aXYb")
    })

    it("mapPos maps through keep and replace sections", () => {
        let d = doc("hello")
        // replace "ell" (2..5) with "i"
        let change = ChangeSet.create(d, {from: 2, to: 5, insert: Slice.of([Leaf.text("i")])})
        expect(change.mapPos(0)).toBe(0)
        expect(change.mapPos(1)).toBe(1)
        // start of a replace maps to the insert point (assoc does not push past)
        expect(change.mapPos(2, -1)).toBe(2)
        expect(change.mapPos(2, 1)).toBe(2)
        // interior of deleted range: assoc chooses before/after insert
        expect(change.mapPos(3, -1)).toBe(2)
        expect(change.mapPos(3, 1)).toBe(3)
        expect(change.mapPos(5)).toBe(3)
        expect(change.mapPos(6)).toBe(4)
        expect(change.mapPos(7)).toBe(5)
    })
})

describe("ChangeSet JSON / eq / iter", () => {
    let {schema, paragraph, bold} = basicSchema()

    function doc(text: string) {
        return schema.doc([paragraph.create([Leaf.text(text)])])
    }

    it("round-trips keep, mark, and replace sections", () => {
        let d = doc("hi")
        let change = ChangeSet.create(d, [
            {from: 1, to: 3, add: bold},
            {from: 3, to: 3, insert: Slice.of([Leaf.text("!")])},
        ])
        let json = change.toJSON()
        let restored = ChangeSet.fromJSON(schema, json)
        expect(restored.eq(change)).toBe(true)
        expect(restored.apply(d).eq(change.apply(d))).toBe(true)
    })

    it("eq compares sections and data", () => {
        let d = doc("ab")
        let a = ChangeSet.create(d, {from: 1, to: 2, insert: Slice.of([Leaf.text("x")])})
        let b = ChangeSet.create(d, {from: 1, to: 2, insert: Slice.of([Leaf.text("x")])})
        let c = ChangeSet.create(d, {from: 1, to: 2, insert: Slice.of([Leaf.text("y")])})
        expect(a.eq(b)).toBe(true)
        expect(a.eq(c)).toBe(false)
    })

    it("touchesRange and iterChanges report replacements", () => {
        let d = doc("hello")
        let change = ChangeSet.create(d, {from: 2, to: 5, insert: Slice.of([Leaf.text("i")])})
        expect(change.touchesRange(0, 1)).toBe(false)
        expect(change.touchesRange(2, 5)).toBe(true)
        expect(change.touchesRange(1, 6)).toBe(true)

        let ranges: number[][] = []
        change.iterChanges((fromA, toA, fromB, toB) => {
            ranges.push([fromA, toA, fromB, toB])
        })
        expect(ranges).toEqual([[2, 5, 2, 3]])
    })

    it("fromJSON rejects malformed input", () => {
        expect(() => ChangeSet.fromJSON(schema, {} as any)).toThrow(/Invalid ChangeSet/)
        expect(() => ChangeSet.fromJSON(schema, [[1, "nope"] as any])).toThrow(/Invalid ChangeSet/)
    })
})

describe("ChangeSet.transform (OT)", () => {
    let {schema, paragraph} = basicSchema()

    function doc(text: string) {
        return schema.doc([paragraph.create([Leaf.text(text)])])
    }

    it("rebases concurrent inserts at different positions", () => {
        // base "ab" — insert L at start and R at end of text concurrently
        let d = doc("ab")
        let left = ChangeSet.create(d, {from: 1, to: 1, insert: Slice.of([Leaf.text("L")])})
        let right = ChangeSet.create(d, {from: 3, to: 3, insert: Slice.of([Leaf.text("R")])})
        let {a, b} = ChangeSet.transform(d, left, right)
        // apply left then mapped right, or right then mapped left → same
        expect(b.apply(left.apply(d)).textContent()).toBe("LabR")
        expect(a.apply(right.apply(d)).textContent()).toBe("LabR")
    })

    it("rebases concurrent inserts at the same position", () => {
        let d = doc("ab")
        let first = ChangeSet.create(d, {from: 1, to: 1, insert: Slice.of([Leaf.text("X")])})
        let second = ChangeSet.create(d, {from: 1, to: 1, insert: Slice.of([Leaf.text("Y")])})
        let {a, b} = ChangeSet.transform(d, first, second)
        let viaFirst = b.apply(first.apply(d)).textContent()
        let viaSecond = a.apply(second.apply(d)).textContent()
        expect(viaFirst).toBe(viaSecond)
        // both inserts survive
        expect(viaFirst.includes("X")).toBe(true)
        expect(viaFirst.includes("Y")).toBe(true)
        expect(viaFirst.includes("ab")).toBe(true)
    })

    it("instance transform maps one change over another", () => {
        let d = doc("hello")
        let del = ChangeSet.create(d, {from: 2, to: 5, insert: Slice.empty}) // delete "ell"
        let ins = ChangeSet.create(d, {from: 6, to: 6, insert: Slice.of([Leaf.text("!")])})
        let mapped = ins.transform(d, del)
        expect(mapped.apply(del.apply(d)).textContent()).toBe("ho!")
    })
})

describe("ChangeSet correct / fit", () => {
    let {schema, paragraph} = basicSchema()

    function doc(text: string) {
        return schema.doc([paragraph.create([Leaf.text(text)])])
    }

    it("correct is a no-op for plain text replaces", () => {
        let d = doc("hello")
        let change = ChangeSet.create(d, {from: 2, to: 5, insert: Slice.of([Leaf.text("i")])})
        let fixed = change.correct(d)
        expect(fixed.eq(change)).toBe(true)
        expect(fixed.apply(d).textContent()).toBe("hio")
    })

    it("create with fit: true produces an applicable change", () => {
        let d = doc("hello")
        let change = ChangeSet.create(d, {
            from: 1,
            to: 6,
            insert: Slice.of([Leaf.text("x")]),
            fit: true,
        })
        let next = change.apply(d)
        expect(next.textContent()).toBe("x")
        expect(next.content.length).toBe(1)
    })
})

