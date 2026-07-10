import {describe, expect, it} from "vitest"
import {EditorSelection} from "@arrisa/state"
import {
    moveByUnit,
    moveByWord,
    moveToDocSide,
    selectAll,
} from "./motion"
import {para, runPure, stateFromBlocks} from "./test-helpers"

describe("moveByUnit", () => {
    it("collapses a non-empty selection to its forward bound", () => {
        let {state} = stateFromBlocks((s) => [para(s, "hello")], EditorSelection.range(1, 4))
        let result = runPure(state, moveByUnit, {dir: "forward"})
        expect(result.applied).toBe(true)
        expect(result.state.selection.empty).toBe(true)
        expect(result.state.selection.head).toBe(4)
    })

    it("moves the cursor forward by one unit", () => {
        let {state} = stateFromBlocks((s) => [para(s, "ab")], 1)
        let result = runPure(state, moveByUnit, {dir: "forward"})
        expect(result.applied).toBe(true)
        expect(result.state.selection.head).toBe(2)
    })
})

describe("moveByWord", () => {
    it("skips to the end of the next word to the right", () => {
        // "hi there" — cursor at start (1)
        let {state} = stateFromBlocks((s) => [para(s, "hi there")], 1)
        let result = runPure(state, moveByWord, {dir: "right"})
        expect(result.applied).toBe(true)
        // After "hi"
        expect(result.state.selection.head).toBe(3)
    })
})

describe("moveToDocSide", () => {
    it("moves to the document start", () => {
        let {state} = stateFromBlocks((s) => [para(s, "hello")], 4)
        let result = runPure(state, moveToDocSide, {side: "start"})
        expect(result.applied).toBe(true)
        expect(result.state.selection.head).toBeLessThanOrEqual(1)
    })

    it("moves to the document end", () => {
        let {state} = stateFromBlocks((s) => [para(s, "hello")], 1)
        let result = runPure(state, moveToDocSide, {side: "end"})
        expect(result.applied).toBe(true)
        expect(result.state.selection.head).toBeGreaterThan(1)
    })

    it("returns false when already at the target on an empty selection", () => {
        let {state} = stateFromBlocks((s) => [para(s, "hi")], 1)
        // atStart for a single para is typically pos 1
        let atStart = runPure(state, moveToDocSide, {side: "start"})
        if (atStart.applied) state = atStart.state
        expect(moveToDocSide({state}, {side: "start"})).toBe(false)
    })
})

describe("selectAll", () => {
    it("selects the entire document", () => {
        let {state} = stateFromBlocks((s) => [para(s, "hello")], 2)
        let result = runPure(state, selectAll)
        expect(result.applied).toBe(true)
        expect(result.state.selection.from).toBe(0)
        expect(result.state.selection.to).toBe(state.doc.length)
    })
})
