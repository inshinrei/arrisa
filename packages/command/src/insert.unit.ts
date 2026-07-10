import {describe, expect, it} from "vitest"
import {Leaf, Plot, Schema} from "@arrisa/doc"
import {EditorSelection, EditorState} from "@arrisa/state"
import {enter, insertLineBreak, insertText, transposeChars} from "./insert"
import {para, runPure, stateFromBlocks} from "./test-helpers"

describe("insertText", () => {
    it("inserts text at the given range and moves the cursor", () => {
        let {state} = stateFromBlocks((s) => [para(s, "hi")], 1)
        let result = runPure(state, insertText, {from: 1, to: 1, insert: "X", userEvent: "input.type"})
        expect(result.applied).toBe(true)
        expect(result.state.doc.textContent()).toBe("Xhi")
    })

    it("replaces a non-empty range", () => {
        let {state} = stateFromBlocks((s) => [para(s, "hello")], 1)
        let result = runPure(state, insertText, {from: 1, to: 6, insert: "yo", userEvent: "input.type"})
        expect(result.applied).toBe(true)
        expect(result.state.doc.textContent()).toBe("yo")
    })
})

describe("insertLineBreak", () => {
    it("inserts a newline when the parent preserves whitespace", () => {
        let pre = Plot.define("pre", {
            inlineContent: true,
            preserveWhitespace: true,
            shape: {element: "pre"},
        })
        let docType = Plot.defineDoc({blockContent: pre})
        let schema = Schema.define([docType, pre])
        let doc = schema.doc([pre.create([Leaf.text("ab")])])
        let state = EditorState.create({
            doc,
            selection: EditorSelection.cursor(2),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        let result = runPure(state, insertLineBreak)
        expect(result.applied).toBe(true)
        expect(result.state.doc.textContent()).toContain("\n")
    })

    it("returns false in a normal paragraph without a linebreak node", () => {
        let {state} = stateFromBlocks((s) => [para(s, "ab")], 2)
        expect(insertLineBreak({state}, null)).toBe(false)
    })
})

describe("enter", () => {
    it("splits a textblock at the cursor", () => {
        let {state} = stateFromBlocks((s) => [para(s, "ab")], 2)
        let result = runPure(state, enter)
        expect(result.applied).toBe(true)
        expect(result.state.doc.content.length).toBe(2)
        expect(result.state.doc.textContent()).toBe("a\nb")
    })
})

describe("transposeChars", () => {
    it("returns false when the selection is not a cursor", () => {
        let {state} = stateFromBlocks((s) => [para(s, "ab")], EditorSelection.range(1, 2))
        expect(transposeChars({state}, null)).toBe(false)
    })

    it("swaps the clusters on either side of the cursor", () => {
        // "ab" cursor between a and b (pos 2)
        let {state} = stateFromBlocks((s) => [para(s, "ab")], 2)
        let result = runPure(state, transposeChars)
        expect(result.applied).toBe(true)
        expect(result.state.doc.textContent()).toBe("ba")
    })

    it("returns false at the start of a textblock (no char before)", () => {
        let {state} = stateFromBlocks((s) => [para(s, "ab")], 1)
        expect(transposeChars({state}, null)).toBe(false)
    })
})
