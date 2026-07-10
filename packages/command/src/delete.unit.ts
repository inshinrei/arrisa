import {describe, expect, it} from "vitest"
import {EditorSelection} from "@arrisa/state"
import {deleteLine, deleteToLineEnd, deleteUnit, deleteWord} from "./delete"
import {mockArrisa, para, runPure, stateFromBlocks} from "./test-helpers"
import {Command} from "./command"

describe("deleteUnit", () => {
    it("deletes a non-empty selection", () => {
        let {state} = stateFromBlocks((s) => [para(s, "hello")], EditorSelection.range(1, 4))
        let result = runPure(state, deleteUnit, "forward")
        expect(result.applied).toBe(true)
        expect(result.state.doc.textContent()).toBe("lo")
    })

    it("deletes one character backward at a cursor", () => {
        let {state} = stateFromBlocks((s) => [para(s, "ab")], 3)
        let result = runPure(state, deleteUnit, "backward")
        expect(result.applied).toBe(true)
        expect(result.state.doc.textContent()).toBe("a")
    })

    it("deletes one character forward at a cursor", () => {
        let {state} = stateFromBlocks((s) => [para(s, "ab")], 1)
        let result = runPure(state, deleteUnit, "forward")
        expect(result.applied).toBe(true)
        expect(result.state.doc.textContent()).toBe("b")
    })
})

describe("deleteWord", () => {
    it("deletes a word backward", () => {
        let {state} = stateFromBlocks((s) => [para(s, "hi there")], 3)
        let result = runPure(state, deleteWord, "backward")
        expect(result.applied).toBe(true)
        expect(result.state.doc.textContent()).toBe(" there")
    })
})

describe("deleteToLineEnd / deleteLine", () => {
    it("deleteToLineEnd returns selection-delete without calling the view", () => {
        let {state} = stateFromBlocks((s) => [para(s, "hello")], EditorSelection.range(1, 3))
        let editor = mockArrisa(state)
        let result = deleteToLineEnd(editor, "forward")
        expect(result).not.toBe(false)
        expect(typeof result).not.toBe("boolean")
        // Spec is returned; dispatch applies it.
        expect(Command.dispatch(editor, deleteToLineEnd, "forward")).toBe(true)
        expect(editor.state.doc.textContent()).toBe("llo")
    })

    it("deleteToLineEnd deletes from cursor to a mocked line boundary", () => {
        let {state} = stateFromBlocks((s) => [para(s, "hello")], 2)
        let editor = mockArrisa(state, {
            moveToLineBoundary: (_sel, forward) =>
                forward ? EditorSelection.cursor(6) : EditorSelection.cursor(1),
        })
        let result = deleteToLineEnd(editor, "forward")
        expect(result).not.toBe(false)
        if (typeof result != "boolean" && result) {
            let next = state.update(result).state
            expect(next.doc.textContent()).toBe("h")
        }
    })

    it("deleteLine deletes the whole mocked visual line", () => {
        let {state} = stateFromBlocks((s) => [para(s, "hello")], 3)
        let editor = mockArrisa(state, {
            moveToLineBoundary: (_sel, forward) =>
                forward ? EditorSelection.cursor(6) : EditorSelection.cursor(1),
        })
        let result = deleteLine(editor, null)
        expect(result).not.toBe(false)
        if (typeof result != "boolean" && result) {
            let next = state.update(result).state
            expect(next.doc.textContent()).toBe("")
        }
    })
})
