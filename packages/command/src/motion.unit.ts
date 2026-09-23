import {describe, expect, it} from "vitest"
import {Leaf, Schema} from "@arrisa/doc"
import {EditorSelection, EditorState} from "@arrisa/state"
import {Blockquote, CodeBlock, Doc, HorizontalRule, Paragraph} from "@arrisa/types"
import {
    collapseSelection,
    moveByLine,
    moveByUnit,
    moveByWord,
    moveToDocSide,
    selectAll,
} from "./motion"
import {apply, mockArrisa, para, runPure, stateFromBlocks} from "./test-helpers"

function codeExitState(withNext: boolean) {
    let schema = Schema.define([Doc, Paragraph, CodeBlock])
    let blocks = [CodeBlock.create([Leaf.text("hi")])]
    if (withNext) blocks.push(Paragraph.create([Leaf.text("next")]))
    let doc = schema.doc(blocks)
    let code = doc.content[0]!
    if (!code.isPlot) throw new Error("expected a code block")
    let end = 1 + code.contentLength
    let state = EditorState.create({
        doc,
        selection: EditorSelection.cursor(end, -1),
        config: [EditorState.schemaElement.of(schema.elements)],
    })
    return {state, end}
}

function headTextblockName(state: EditorState) {
    let parent = state.doc.resolve(state.selection.head).textblockParent
    return parent ? parent.node.type.name : ""
}

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

    it("inserts a paragraph after a lone code block on arrow right", () => {
        let {state} = codeExitState(false)
        let result = runPure(state, moveByUnit, {dir: "right"})
        expect(result.applied).toBe(true)
        expect(result.state.doc.content).toHaveLength(2)
        expect(result.state.doc.content[1]!.type).toBe(Paragraph.type)
        expect(headTextblockName(result.state)).not.toBe("CodeBlock")
    })

    it("moves into a following paragraph without inserting a block", () => {
        let {state} = codeExitState(true)
        let result = runPure(state, moveByUnit, {dir: "right"})
        expect(result.applied).toBe(true)
        expect(result.state.doc.content).toHaveLength(2)
        expect(headTextblockName(result.state)).toBe("Paragraph")
    })

    it("enters a following code block without inserting a block", () => {
        let schema = Schema.define([Doc, Paragraph, CodeBlock])
        let doc = schema.doc([CodeBlock.create([Leaf.text("hi")]), CodeBlock.create([Leaf.text("yo")])])
        let code = doc.content[0]!
        if (!code.isPlot) throw new Error("expected a code block")
        let end = 1 + code.contentLength
        let state = EditorState.create({
            doc,
            selection: EditorSelection.cursor(end, -1),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        let result = runPure(state, moveByUnit, {dir: "right"})
        expect(result.applied).toBe(true)
        expect(result.state.doc.content).toHaveLength(2)
        expect(result.state.doc.content[0]!.type).toBe(CodeBlock.type)
        expect(result.state.doc.content[1]!.type).toBe(CodeBlock.type)
        let parent = result.state.doc.resolve(result.state.selection.head).textblockParent
        expect(parent?.node.textContent()).toBe("yo")
    })

    it("moves into a following blockquote without inserting a block", () => {
        let schema = Schema.define([Doc, Paragraph, CodeBlock, Blockquote])
        let doc = schema.doc([
            CodeBlock.create([Leaf.text("hi")]),
            Blockquote.create([Paragraph.create([Leaf.text("quoted")])]),
        ])
        let code = doc.content[0]!
        if (!code.isPlot) throw new Error("expected a code block")
        let end = 1 + code.contentLength
        let state = EditorState.create({
            doc,
            selection: EditorSelection.cursor(end, -1),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        let result = runPure(state, moveByUnit, {dir: "right"})
        expect(result.applied).toBe(true)
        expect(result.state.doc.content).toHaveLength(2)
        expect(result.state.doc.content[1]!.type).toBe(Blockquote.type)
        let parent = result.state.doc.resolve(result.state.selection.head).textblockParent
        expect(parent?.node.type).toBe(Paragraph.type)
        expect(parent?.node.textContent()).toBe("quoted")
    })

    it("does not skip a horizontal rule or insert a paragraph before it", () => {
        let schema = Schema.define([Doc, Paragraph, CodeBlock, HorizontalRule])
        let doc = schema.doc([
            CodeBlock.create([Leaf.text("hi")]),
            HorizontalRule,
            Paragraph.create([Leaf.text("after")]),
        ])
        let code = doc.content[0]!
        if (!code.isPlot) throw new Error("expected a code block")
        let end = 1 + code.contentLength
        let state = EditorState.create({
            doc,
            selection: EditorSelection.cursor(end, -1),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        let result = runPure(state, moveByUnit, {dir: "right"})
        expect(result.applied).toBe(true)
        expect(result.state.doc.content).toHaveLength(3)
        expect(result.state.doc.content[0]!.type).toBe(CodeBlock.type)
        expect(result.state.doc.content[1]!.type).toBe(HorizontalRule.type)
        expect(result.state.doc.content[2]!.type).toBe(Paragraph.type)
        let parent = result.state.doc.resolve(result.state.selection.head).textblockParent
        expect(parent?.node.textContent() ?? "").not.toBe("after")
        let ruleAt = result.state.doc.content[0]!.length
        expect(result.state.selection.from).toBeLessThanOrEqual(ruleAt)
    })

    it("stays inside the code block when the cursor is not at the end", () => {
        let {state, end} = codeExitState(false)
        state = state.update({selection: EditorSelection.cursor(end - 1, -1)}).state
        let result = runPure(state, moveByUnit, {dir: "right"})
        expect(result.applied).toBe(true)
        expect(result.state.doc.content).toHaveLength(1)
        expect(headTextblockName(result.state)).toBe("CodeBlock")
    })

    it("does not insert a paragraph when extending from the end of a code block", () => {
        let {state} = codeExitState(false)
        let result = runPure(state, moveByUnit, {dir: "right", extend: true})
        expect(result.applied).toBe(false)
        expect(result.state.doc.content).toHaveLength(1)
        expect(result.state.doc.content[0]!.type).toBe(CodeBlock.type)
        expect(headTextblockName(result.state)).toBe("CodeBlock")
    })

    it("enters a previous code block on arrow left", () => {
        let schema = Schema.define([Doc, Paragraph, CodeBlock])
        let doc = schema.doc([CodeBlock.create([Leaf.text("hi")]), CodeBlock.create([Leaf.text("yo")])])
        let first = doc.content[0]!
        let start = first.length + 1
        let state = EditorState.create({
            doc,
            selection: EditorSelection.cursor(start, 1),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        let result = runPure(state, moveByUnit, {dir: "left"})
        expect(result.applied).toBe(true)
        expect(result.state.doc.content).toHaveLength(2)
        let parent = result.state.doc.resolve(result.state.selection.head).textblockParent
        expect(parent?.node.textContent()).toBe("hi")
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

describe("collapseSelection", () => {
    it("collapses a range 1..3 to a cursor at the head", () => {
        let {state} = stateFromBlocks((s) => [para(s, "hello")], EditorSelection.range(1, 3))
        let result = runPure(state, collapseSelection)
        expect(result.applied).toBe(true)
        expect(result.state.selection.empty).toBe(true)
        expect(result.state.selection.head).toBe(3)
        expect(result.state.selection.headSide).toBe(state.selection.headSide)
        expect(result.spec).toMatchObject({userEvent: "select"})
    })

    it("returns false when the selection is already an empty cursor", () => {
        let {state} = stateFromBlocks((s) => [para(s, "hello")], 1)
        expect(collapseSelection({state}, null)).toBe(false)
    })
})

describe("moveByLine", () => {
    function loneCode(cursorAt: number) {
        let schema = Schema.define([Doc, Paragraph, CodeBlock])
        let doc = schema.doc([CodeBlock.create([Leaf.text("hi")])])
        let state = EditorState.create({
            doc,
            selection: EditorSelection.cursor(cursorAt, -1),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        return mockArrisa(state)
    }

    it("stays in a lone code block when vertical geometry finds no line", () => {
        let editor = loneCode(3)
        let spec = moveByLine(editor, {dir: "up"})
        expect(spec).not.toBe(false)
        let next = apply(editor.state, spec as Exclude<typeof spec, false>)
        expect(headTextblockName(next)).toBe("CodeBlock")
        expect(next.selection.head).toBeGreaterThan(0)
    })

    it("does not leave a lone code block at the document start", () => {
        let editor = loneCode(1)
        expect(moveByLine(editor, {dir: "up"})).toBe(false)
        expect(headTextblockName(editor.state)).toBe("CodeBlock")
    })
})
