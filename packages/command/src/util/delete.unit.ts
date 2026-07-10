import {describe, expect, it} from "vitest"
import {EditorSelection} from "@arrisa/state"
import {deleteBackward, deleteEmptyTextblock, deleteForward, deleteSelection} from "./delete"
import {para, run, stateFromBlocks} from "./test-helpers"

describe("deleteSelection", () => {
    it("returns false when every range is empty", () => {
        let {state} = stateFromBlocks((s) => [para(s, "hi")], 1)
        expect(deleteSelection(state)).toBe(false)
    })

    it("removes a non-empty range and leaves the rest of the text", () => {
        // "hello" → delete "ell" (2..5) → "ho"
        let {state} = stateFromBlocks((s) => [para(s, "hello")], EditorSelection.range(2, 5))
        let result = run(state, deleteSelection)
        expect(result.applied).toBe(true)
        expect(result.state.doc.textContent()).toBe("ho")
    })
})

describe("deleteEmptyTextblock", () => {
    it("returns false for a non-empty textblock", () => {
        let {state} = stateFromBlocks((s) => [para(s, "x")], 1)
        expect(deleteEmptyTextblock(state)).toBe(false)
    })

    it("returns false when the empty block is the only child of the doc", () => {
        let {state} = stateFromBlocks((s) => [para(s, "")], 1)
        expect(deleteEmptyTextblock(state)).toBe(false)
    })

    it("removes an empty paragraph next to a non-empty one", () => {
        // p("ab") + empty p; cursor in empty (pos 5 = start of second)
        let {state} = stateFromBlocks((s) => [para(s, "ab"), para(s, "")], 5)
        let result = run(state, deleteEmptyTextblock)
        expect(result.applied).toBe(true)
        expect(result.state.doc.textContent()).toBe("ab")
        expect(result.state.doc.content.length).toBe(1)
    })

    it("returns false for a non-cursor selection", () => {
        let {state} = stateFromBlocks((s) => [para(s, "ab"), para(s, "")], EditorSelection.range(1, 2))
        expect(deleteEmptyTextblock(state)).toBe(false)
    })
})

describe("deleteBackward / deleteForward", () => {
    it("returns false when the selection is not a cursor", () => {
        let {state} = stateFromBlocks((s) => [para(s, "hi")], EditorSelection.range(1, 3))
        expect(deleteBackward(state)).toBe(false)
        expect(deleteForward(state)).toBe(false)
    })

    it("deletes one cluster backward", () => {
        // "ab" cursor at end (pos 3) → delete "b" → "a"
        let {state} = stateFromBlocks((s) => [para(s, "ab")], 3)
        let result = run(state, deleteBackward)
        expect(result.applied).toBe(true)
        expect(result.state.doc.textContent()).toBe("a")
    })

    it("deletes one cluster forward", () => {
        // "ab" cursor at start (pos 1) → delete "a" → "b"
        let {state} = stateFromBlocks((s) => [para(s, "ab")], 1)
        let result = run(state, deleteForward)
        expect(result.applied).toBe(true)
        expect(result.state.doc.textContent()).toBe("b")
    })

    it("deletes a word backward", () => {
        // "hi there" cursor at end of "hi" (pos 3) → word-delete → " there"
        let {state} = stateFromBlocks((s) => [para(s, "hi there")], 3)
        let result = run(state, deleteBackward, true)
        expect(result.applied).toBe(true)
        expect(result.state.doc.textContent()).toBe(" there")
    })

    it("deletes a word forward", () => {
        // "hi there" cursor at start of "there" (pos 4 on space? "hi " is 1-3, 't' at 4)
        // positions: 0 open, 1-2 "hi", 3 space, 4-8 "there", 9 close
        let {state} = stateFromBlocks((s) => [para(s, "hi there")], 4)
        let result = run(state, deleteForward, true)
        expect(result.applied).toBe(true)
        expect(result.state.doc.textContent()).toBe("hi ")
    })
})
