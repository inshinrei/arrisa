import {describe, expect, it} from "vitest"
import {Leaf} from "@arrisa/doc"
import {KeyBinding} from "@arrisa/editor"
import {EditorSelection, type EditorState, type Transaction} from "@arrisa/state"
import {Code, CodeBlock, Paragraph} from "@arrisa/types"
import {blockDoc, codeBlock, paragraph} from "./block"
import {indentCodeBlock, outdentCodeBlock} from "./code-indent"
import {code} from "./mark"
import {makeState} from "./test-helpers"

// A lone block's content starts at 1; position 0 is the open token.
function blockState(text: string, kind: "code" | "paragraph", selection: number | EditorSelection) {
    let extensions = [blockDoc(), paragraph(), codeBlock(), code()]
    let proto = makeState(extensions)
    let node = kind == "code" ? CodeBlock.create([Leaf.text(text)]) : Paragraph.create([Leaf.text(text)])
    return makeState(extensions, {doc: proto.schema.doc([node]), selection})
}

function codeState(text: string, selection: number | EditorSelection) {
    return blockState(text, "code", selection)
}

function apply(state: EditorState, spec: false | Transaction.Spec) {
    if (!spec) return state
    return state.update(spec).state
}

describe("indentCodeBlock", () => {
    it("inserts four spaces after the caret in a code block", () => {
        let state = codeState("ab", 1 + "ab".length)
        let spec = indentCodeBlock({state}, null)
        expect(spec).toMatchObject({userEvent: "input.indent", scrollIntoView: true})
        let next = apply(state, spec)
        expect(next.doc.textContent()).toBe("ab    ")
        let block = next.doc.resolve(next.selection.head).textblockParent
        expect(next.selection.head).toBe(block!.end)
        expect(next.selection.headSide).toBe(-1)
    })

    it("returns false in a paragraph and leaves the document unchanged", () => {
        let state = blockState("hi", "paragraph", 2)
        let doc = state.doc
        expect(indentCodeBlock({state}, null)).toBe(false)
        expect(state.doc).toBe(doc)
        expect(state.doc.textContent()).toBe("hi")
    })

    it("returns false inside an inline code mark", () => {
        let extensions = [blockDoc(), paragraph(), codeBlock(), code()]
        let proto = makeState(extensions)
        let doc = proto.schema.doc([Paragraph.create([Leaf.text("ab", [Code])])])
        let state = makeState(extensions, {doc, selection: 2})
        expect(indentCodeBlock({state}, null)).toBe(false)
        expect(state.doc.textContent()).toBe("ab")
    })

    it("indents every line covered by a selection", () => {
        let text = "a\nb"
        let state = codeState(text, EditorSelection.range(1, 1 + text.length))
        let next = apply(state, indentCodeBlock({state}, null))
        expect(next.doc.textContent()).toBe("    a\n    b")
        expect(next.selection.anchor).toBe(1)
        expect(next.selection.head).toBe(1 + "    a\n    b".length)
    })
})

describe("outdentCodeBlock", () => {
    it("removes up to four spaces immediately before the caret", () => {
        let text = "ab    "
        let state = codeState(text, 1 + text.length)
        let next = apply(state, outdentCodeBlock({state}, null))
        expect(next.doc.textContent()).toBe("ab")
    })

    it("removes leading spaces when the caret is at the line start", () => {
        let state = codeState("    ab", 1)
        let next = apply(state, outdentCodeBlock({state}, null))
        expect(next.doc.textContent()).toBe("ab")
    })

    it("returns false when the caret is not in whitespace", () => {
        let state = codeState("ab", 2)
        let doc = state.doc
        expect(outdentCodeBlock({state}, null)).toBe(false)
        expect(state.doc).toBe(doc)
    })

    it("outdents each selected line and skips a line with no indent", () => {
        let text = "    a\n\tb\nc"
        let state = codeState(text, EditorSelection.range(1, 1 + text.length))
        let next = apply(state, outdentCodeBlock({state}, null))
        expect(next.doc.textContent()).toBe("a\nb\nc")
    })

    it("removes a leading tab immediately before the caret", () => {
        let state = codeState("\thello", 2)
        let spec = outdentCodeBlock({state}, null)
        expect(spec).toMatchObject({userEvent: "input.outdent", scrollIntoView: true})
        let next = apply(state, spec)
        expect(next.doc.textContent()).toBe("hello")
    })
})

describe("codeBlock tab binding", () => {
    it("installs Tab with allowDefault and a shift command", () => {
        let state = makeState([blockDoc(), paragraph(), codeBlock()])
        let tab = state.facet(KeyBinding.source).find((binding) => binding.spec.key == "Tab")
        expect(tab?.spec.allowDefault).toBe(true)
        expect(tab?.spec.run).toBe(indentCodeBlock)
        expect(tab?.spec.shift).toBe(outdentCodeBlock)
    })
})
