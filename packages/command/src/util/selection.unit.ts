import {describe, expect, it} from "vitest"
import {Leaf} from "@arrisa/doc"
import {EditorSelection} from "@arrisa/state"
import {canAddMarkInRange, selectedTextblocks} from "./selection"
import {para, stateFromBlocks, testSchema} from "./test-helpers"

describe("selectedTextblocks", () => {
    it("returns each textblock covered by the selection once", () => {
        // three single-char paras → length 9; select across first two+
        let {state} = stateFromBlocks(
            (s) => [para(s, "a"), para(s, "b"), para(s, "c")],
            EditorSelection.range(1, 7),
        )
        let blocks = selectedTextblocks(state)
        expect(blocks.length).toBeGreaterThanOrEqual(2)
        expect(blocks.every((b) => b.node.isTextblock)).toBe(true)
        expect(blocks.every((b) => b.node.name == "paragraph")).toBe(true)
    })

    it("returns a single block for a cursor inside one paragraph", () => {
        let {state} = stateFromBlocks((s) => [para(s, "hello")], 3)
        let blocks = selectedTextblocks(state)
        expect(blocks.length).toBe(1)
        expect(blocks[0].node.textContent()).toBe("hello")
    })
})

describe("canAddMarkInRange", () => {
    it("is true when some text in the range can take the mark", () => {
        let s = testSchema()
        let doc = s.schema.doc([para(s, "hello")])
        expect(canAddMarkInRange(doc, 1, 6, s.bold)).toBe(true)
        expect(canAddMarkInRange(doc, 1, 6, s.bold.type)).toBe(true)
    })

    it("is false when the mark is already present on the text", () => {
        let s = testSchema()
        let doc = s.schema.doc([s.paragraph.create([Leaf.text("hi", [s.bold])])])
        expect(canAddMarkInRange(doc, 1, 3, s.bold)).toBe(false)
    })
})
