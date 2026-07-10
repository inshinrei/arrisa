import {describe, expect, it} from "vitest"
import {ChangeSet, Leaf, Plot, Schema, Slice} from "@arrisa/doc"
import {CoordPos} from "./pos"

function doc(text: string) {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph])
    return schema.doc([paragraph.create([Leaf.text(text)])])
}

describe("CoordPos", () => {
    it("create fills defaults", () => {
        let p = CoordPos.create(3, -1)
        expect(p.pos).toBe(3)
        expect(p.side).toBe(-1)
        expect(p.target).toBe(null)
        expect(p.vertOutside).toBe(false)
    })

    it("map shifts pos and target through a change", () => {
        let d = doc("hello")
        // replace "ell" (2..5) with "i" → "hio"
        let change = ChangeSet.create(d, {from: 2, to: 5, insert: Slice.of([Leaf.text("i")])})
        let mapped = CoordPos.create(4, 1, 3).map(change)
        expect(mapped.pos).toBe(change.mapPos(4))
        expect(mapped.target).toBe(change.mapPos(3, 1, "after"))
        expect(mapped.side).toBe(1)
    })

    it("map leaves null target as null", () => {
        let d = doc("ab")
        let change = ChangeSet.create(d, {from: 1, to: 1, insert: Slice.of([Leaf.text("X")])})
        let mapped = CoordPos.create(1, -1).map(change)
        expect(mapped.target).toBe(null)
        expect(mapped.pos).toBe(change.mapPos(1))
    })
})
