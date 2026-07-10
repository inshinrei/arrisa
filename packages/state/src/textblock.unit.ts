import {describe, expect, it} from "vitest"
import {Leaf, Plot, Schema} from "@arrisa/doc"
import {TextblockMap} from "./textblock"

function basicSchema() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph])
    return {schema, paragraph}
}

function paraMap(text: string, ltr = true) {
    let {schema, paragraph} = basicSchema()
    let d = schema.doc([paragraph.create([Leaf.text(text)])])
    // Paragraph open is at 0; content starts at 1
    let node = d.content[0] as Plot
    return {map: TextblockMap.get(1, node, ltr), node, doc: d, start: 1}
}

describe("TextblockMap.get / cache", () => {
    it("returns the same instance for identical start/ltr", () => {
        let {schema, paragraph} = basicSchema()
        let d = schema.doc([paragraph.create([Leaf.text("ab")])])
        let node = d.content[0] as Plot
        let a = TextblockMap.get(1, node, true)
        let b = TextblockMap.get(1, node, true)
        expect(a).toBe(b)
    })

    it("reuses text/sections when only start changes", () => {
        let {schema, paragraph} = basicSchema()
        let d = schema.doc([paragraph.create([Leaf.text("ab")])])
        let node = d.content[0] as Plot
        let a = TextblockMap.get(1, node, true)
        let b = TextblockMap.get(10, node, true)
        expect(b).not.toBe(a)
        expect(b.text).toBe(a.text)
        expect(b.start).toBe(10)
        expect(b.fromIndex(0)).toBe(10)
    })
})

describe("toIndex / fromIndex", () => {
    it("round-trips content positions for plain text", () => {
        let {map, start} = paraMap("hello")
        expect(map.text).toBe("hello")
        for (let i = 0; i <= 5; i++) {
            let pos = start + i
            expect(map.toIndex(pos)).toBe(i)
            expect(map.fromIndex(i)).toBe(pos)
        }
    })

    it("maps a length-1 atom as a single replacement character", () => {
        let paragraph = Plot.define("paragraph", {
            inlineContent: true,
            shape: {element: "p"},
        })
        let br = Leaf.define("br", {inline: true, shape: {element: "br"}})
        let docType = Plot.defineDoc({blockContent: paragraph})
        let schema = Schema.define([docType, paragraph, br])
        let d = schema.doc([paragraph.create([Leaf.text("a"), br, Leaf.text("b")])])
        let node = d.content[0] as Plot
        let map = TextblockMap.get(1, node, true)
        expect(map.text).toBe("a\ufffcb")
        // positions: 1='a', 2=br, 3='b'
        expect(map.toIndex(1)).toBe(0)
        expect(map.toIndex(2)).toBe(1)
        expect(map.toIndex(3)).toBe(2)
        expect(map.fromIndex(1)).toBe(2)
    })
})

describe("moveLogically", () => {
    it("advances one cluster forward and backward", () => {
        let {map} = paraMap("ab")
        let fwd = map.moveLogically(1, true)
        expect(fwd).toEqual({pos: 2, side: -1})
        let back = map.moveLogically(2, false)
        expect(back).toEqual({pos: 1, side: 1})
    })

    it("returns null at the block edges", () => {
        let {map} = paraMap("a")
        expect(map.moveLogically(1, false)).toBeNull()
        expect(map.moveLogically(2, true)).toBeNull()
    })
})

describe("skipWord", () => {
    it("skips forward to the end of the first word", () => {
        let {map} = paraMap("hello world")
        // start on 'h' (pos 1) → after "hello" (pos 6, space)
        let next = map.skipWord(1, 1, true, false)
        expect(next).not.toBeNull()
        expect(next!.pos).toBe(6)
    })

    it("skips backward to the start of the word (regression: reverse char accum)", () => {
        let {map} = paraMap("hello world")
        // start just after "hello" (pos 6 = space) → back to 'h' (pos 1)
        let next = map.skipWord(6, -1, false, false)
        expect(next).not.toBeNull()
        expect(next!.pos).toBe(1)
    })

    it("returns null when there is no letter/number content", () => {
        let {map} = paraMap("   ")
        expect(map.skipWord(1, 1, true, false)).toBeNull()
    })
})

describe("visualSide", () => {
    it("returns block ends for LTR plain text", () => {
        let {map} = paraMap("hi")
        expect(map.visualSide(true)).toEqual({pos: 1, side: 1})
        expect(map.visualSide(false)).toEqual({pos: 3, side: -1})
    })
})
