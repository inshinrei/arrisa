import {describe, expect, it} from "vitest"
import {Leaf, Node, Plot, Schema} from "@arrisa/doc"
import {EditorSelection, EditorState} from "@arrisa/state"
import {baseHandlers, codeGapType, inputEventRange, rangeOutsideCodeBlock} from "./handlers"

function gapSchema() {
    let paragraph = Plot.define("Paragraph", {
        inlineContent: true,
        defaultBlock: true,
        shape: {element: "p"},
    })
    let code = Plot.define("CodeBlock", {
        inlineContent: true,
        role: Node.Role.Code,
        shape: {element: "pre"},
    })
    let docType = Plot.defineDoc({blockContent: [paragraph, code]})
    let schema = Schema.define([docType, paragraph, code])
    return {schema, paragraph, code}
}

function blocksOf(state: EditorState) {
    return state.doc.content.map((node) => ({
        name: node.name,
        text: node.isPlot ? node.textContent() : "",
    }))
}

describe("inputEventRange", () => {
    it("falls back to selection when getTargetRanges is empty", () => {
        let editor = {
            state: {selection: {from: 1, to: 3}},
        } as any
        let event = {
            getTargetRanges() {
                return []
            },
        } as unknown as InputEvent

        expect(inputEventRange(event, editor)).toEqual({from: 1, to: 3})
    })
})

describe("beforeinput after Tab", () => {
    function editor(lastKeyCode: number, lastKeyTime = Date.now(), lastKey = "Tab") {
        return {inputState: {lastKeyCode, lastKey, lastKeyTime}} as any
    }

    function event(inputType: string, data: string | null = null) {
        return {inputType, data} as InputEvent
    }

    it("drops a paragraph break, a line break, and a tab character", () => {
        expect(baseHandlers.beforeinput!(editor(9), event("insertParagraph"))).toBe(true)
        expect(baseHandlers.beforeinput!(editor(0), event("insertParagraph"))).toBe(true)
        expect(baseHandlers.beforeinput!(editor(9), event("insertLineBreak"))).toBe(true)
        expect(baseHandlers.beforeinput!(editor(9), event("insertText", "\t"))).toBe(true)
    })

    it("does not drop a paragraph break for an older Tab", () => {
        let reached = false
        let target = {
            inputState: {lastKey: "Tab", lastKeyCode: 9, lastKeyTime: Date.now() - 5000},
            state: {
                facet() {
                    reached = true
                    return new Map()
                },
            },
        } as any
        expect(() => baseHandlers.beforeinput!(target, event("insertParagraph"))).toThrow()
        expect(reached).toBe(true)
    })
})

describe("typing after a code block", () => {
    function at(doc: ReturnType<Schema["doc"]>, pos: number) {
        return EditorState.create({doc, selection: EditorSelection.cursor(pos, 1)})
    }

    it("inserts a default textblock when the cursor is in the gap", () => {
        let {schema, code} = gapSchema()
        let doc = schema.doc([code.create([Leaf.text("ab")])])
        let state = at(doc, doc.content[0]!.length)
        let spec = codeGapType(state, "Z")
        expect(spec).toBeTruthy()
        let next = state.update(spec!)
        expect(next.isUserEvent("input.type")).toBe(true)
        expect(blocksOf(next.state)).toEqual([
            {name: "CodeBlock", text: "ab"},
            {name: "Paragraph", text: "Z"},
        ])
        let block = next.state.doc.resolve(next.state.selection.head).textblockParent
        expect(block?.node.type.name).toBe("Paragraph")
        expect(next.state.selection.head).toBe(block!.end)
    })

    it("inserts at the start of a textblock that already follows", () => {
        let {schema, code, paragraph} = gapSchema()
        let doc = schema.doc([code.create([Leaf.text("ab")]), paragraph.create([Leaf.text("hi")])])
        let state = at(doc, doc.content[0]!.length)
        let next = state.update(codeGapType(state, "Z")!)
        expect(next.isUserEvent("input.type")).toBe(true)
        expect(blocksOf(next.state)).toEqual([
            {name: "CodeBlock", text: "ab"},
            {name: "Paragraph", text: "Zhi"},
        ])
        let block = next.state.doc.resolve(next.state.selection.head).textblockParent
        expect(block?.node.textContent()).toBe("Zhi")
        expect(next.state.selection.head).toBe(block!.start + 1)
    })

    it("leaves a cursor inside a code block alone", () => {
        let {schema, code} = gapSchema()
        let doc = schema.doc([code.create([Leaf.text("ab")])])
        let state = at(doc, 3)
        expect(codeGapType(state, "Z")).toBeNull()
        expect(rangeOutsideCodeBlock(state, 3, 3)).toEqual({from: 3, to: 3})
    })

    it("keeps a keystroke on the following line when the DOM range is in the code block", () => {
        let {schema, code, paragraph} = gapSchema()
        let doc = schema.doc([code.create([Leaf.text("ab")]), paragraph.create([])])
        let state = at(doc, doc.content[0]!.length + 1)
        expect(rangeOutsideCodeBlock(state, 3, 3)).toEqual({from: state.selection.head, to: state.selection.head})
        let specs: any[] = []
        let editor = {
            state,
            inputState: {lastKey: "", lastKeyCode: 0, lastKeyTime: 0},
            viewState: {pending: []},
            docTile: {posFromDOM: () => 3},
            dispatch(spec: any) {
                specs.push(spec)
            },
        } as any
        let event = {
            inputType: "insertText",
            data: "`",
            getTargetRanges() {
                return [{startContainer: {}, startOffset: 2, collapsed: true}]
            },
        } as unknown as InputEvent
        expect(baseHandlers.beforeinput!(editor, event)).toBe(true)
        let next = state.update(specs[0])
        expect(next.isUserEvent("input.type")).toBe(true)
        expect(blocksOf(next.state)).toEqual([
            {name: "CodeBlock", text: "ab"},
            {name: "Paragraph", text: "`"},
        ])
    })

    it("dispatches the gap insert without reading the DOM range", () => {
        let {schema, code} = gapSchema()
        let doc = schema.doc([code.create([Leaf.text("ab")])])
        let state = at(doc, doc.content[0]!.length)
        let specs: any[] = []
        let editor = {
            state,
            inputState: {lastKey: "", lastKeyCode: 0, lastKeyTime: 0},
            dispatch(spec: any) {
                specs.push(spec)
            },
        } as any
        expect(baseHandlers.beforeinput!(editor, {inputType: "insertText", data: "Z"} as InputEvent)).toBe(true)
        expect(blocksOf(state.update(specs[0]).state)[1]).toEqual({name: "Paragraph", text: "Z"})
    })
})
