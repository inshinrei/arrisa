import {describe, expect, it} from "vitest"
import {Leaf, Mark, Plot, Schema} from "@arrisa/doc"
import {EditorSelection} from "./selection"
import {Text} from "./text"
import {Resolved} from "./resolved"

function basicSchema() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let bold = Mark.define("strong", {shape: {element: "strong"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph, bold])
    return {schema, paragraph, bold}
}

describe("Resolved", () => {
    let {schema, paragraph, bold} = basicSchema()

    it("resolves empty and non-empty selections", () => {
        let d = schema.doc([paragraph.create([Leaf.text("hello")])])
        let cur = Resolved.create(d, EditorSelection.cursor(2))
        expect(cur.anchor.pos).toBe(2)
        expect(cur.head.pos).toBe(2)
        expect(cur.from.pos).toBe(2)
        expect(cur.to.pos).toBe(2)
        expect(cur.ranges).toHaveLength(1)
        expect(cur.ranges[0].from.pos).toBe(2)

        let range = Resolved.create(d, EditorSelection.range(1, 4))
        expect(range.from.pos).toBe(1)
        expect(range.to.pos).toBe(4)
        expect(range.anchor.pos).toBe(1)
        expect(range.head.pos).toBe(4)
    })

    it("uses stored marks as activeMarks when present", () => {
        let d = schema.doc([paragraph.create([Leaf.text("hello")])])
        let sel = Text.create({anchor: 2, head: 2, marks: [bold]})
        let res = Resolved.create(d, sel)
        expect(res.activeMarks).toEqual([bold])
    })

    it("falls back to document marks at a cursor inside marked text", () => {
        let d = schema.doc([paragraph.create([Leaf.text("hi", [bold])])])
        // Cursor inside the marked text leaf (pos.marks reads the leaf at inText)
        let res = Resolved.create(d, EditorSelection.cursor(2))
        expect(res.activeMarks.some((m) => m.eq(bold))).toBe(true)
    })
})
