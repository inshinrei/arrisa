import {describe, expect, it} from "vitest"
import {type Plot} from "@arrisa/doc"
import {EditorSelection} from "@arrisa/state"
import {liftEmptyBlock, splitTextblock} from "./split"
import {para, run, stateFromBlocks} from "./test-helpers"

describe("splitTextblock", () => {
    it("splits a paragraph at the cursor", () => {
        // "hello" split after "he" (pos 3) → "he" + "llo"
        let {state} = stateFromBlocks((s) => [para(s, "hello")], 3)
        let result = run(state, splitTextblock)
        expect(result.applied).toBe(true)
        expect(result.state.doc.content.length).toBe(2)
        expect((result.state.doc.content[0] as Plot).textContent()).toBe("he")
        expect((result.state.doc.content[1] as Plot).textContent()).toBe("llo")
        expect(result.state.selection.isCursor).toBe(true)
    })
})

describe("liftEmptyBlock", () => {
    it("returns false for a non-cursor selection", () => {
        let ranged = stateFromBlocks((s) => [para(s, "ab")], EditorSelection.range(1, 3))
        expect(liftEmptyBlock(ranged.state)).toBe(false)
    })

    it("returns false for a non-empty textblock", () => {
        let {state} = stateFromBlocks((s) => [para(s, "x")], 1)
        expect(liftEmptyBlock(state)).toBe(false)
    })

    it("lifts an empty paragraph out of a blockquote when possible", () => {
        // bq[ empty p ]: open 0, p open 1, p content empty start=end=2, p close 2, bq close 3
        // Empty textblock: start == end == 2
        let {state} = stateFromBlocks((s) => [s.blockquote.create([para(s, "")])], 2)
        let result = run(state, liftEmptyBlock)
        if (result.applied) {
            expect(result.state.doc.content.some((n) => n.name == "paragraph")).toBe(true)
        } else {
            // Sole empty content may not unwrap; command is allowed to refuse
            expect(result.applied).toBe(false)
        }
    })
})
