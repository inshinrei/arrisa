import {describe, expect, it} from "vitest"
import {Leaf, Plot, Schema} from "@arrisa/doc"
import {EditorSelection, EditorState} from "@arrisa/state"
import {CodeBlock, CodeBlockLanguage, Doc, Paragraph} from "@arrisa/types"
import {enter, insertLineBreak, insertText, transposeChars} from "./insert"
import {para, runPure, stateFromBlocks} from "./test-helpers"

function codeDocState(
    content: Parameters<Schema["doc"]>[0],
    selection: number | EditorSelection,
) {
    let schema = Schema.define([Doc, Paragraph, CodeBlock, CodeBlockLanguage])
    let doc = schema.doc(content)
    let sel = typeof selection == "number" ? EditorSelection.cursor(selection) : selection
    return EditorState.create({
        doc,
        selection: sel,
        config: [EditorState.schemaElement.of(schema.elements)],
    })
}

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

    it("exits a code block at the end into a paragraph", () => {
        // <pre><code>ab|</code></pre>  positions: open=0, a=1, b=2, end=3
        let state = codeDocState([CodeBlock.create([Leaf.text("ab")])], 3)
        let result = runPure(state, enter)
        expect(result.applied).toBe(true)
        expect(result.state.doc.content.length).toBe(2)
        expect(result.state.doc.content[0].type).toBe(CodeBlock.type)
        expect(result.state.doc.content[1].type).toBe(Paragraph.type)
        expect((result.state.doc.content[0] as Plot).textContent()).toBe("ab")
        expect((result.state.doc.content[1] as Plot).textContent()).toBe("")
    })

    it("splits a code block mid-content into two code blocks", () => {
        // cursor between a and b
        let state = codeDocState([CodeBlock.create([Leaf.text("ab")])], 2)
        let result = runPure(state, enter)
        expect(result.applied).toBe(true)
        expect(result.state.doc.content.length).toBe(2)
        expect(result.state.doc.content[0].type).toBe(CodeBlock.type)
        expect(result.state.doc.content[1].type).toBe(CodeBlock.type)
        expect((result.state.doc.content[0] as Plot).textContent()).toBe("a")
        expect((result.state.doc.content[1] as Plot).textContent()).toBe("b")
    })

    it("keeps language mark when splitting a code block", () => {
        let tag = CodeBlock.withMarks(CodeBlockLanguage.of("ts").addToSet(CodeBlock.marks))
        let state = codeDocState([tag.create([Leaf.text("ab")])], 2)
        let result = runPure(state, enter)
        expect(result.applied).toBe(true)
        expect(result.state.doc.content[0].tag.mark(CodeBlockLanguage)).toBe("ts")
        expect(result.state.doc.content[1].tag.mark(CodeBlockLanguage)).toBe("ts")
    })

    it("exits an empty code block to a paragraph", () => {
        // empty code block: open=0, content start=1, close=1 → cursor at 1
        let state = codeDocState([CodeBlock.create([])], 1)
        let result = runPure(state, enter)
        expect(result.applied).toBe(true)
        // Prefer ending in a paragraph (or a following empty paragraph after the code block).
        let types = result.state.doc.content.map((n) => n.type)
        expect(types.some((t) => t == Paragraph.type)).toBe(true)
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
