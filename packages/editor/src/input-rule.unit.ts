import {describe, expect, it} from "vitest"
import {Leaf, Plot, Schema, Slice} from "@arrisa/doc"
import {EditorSelection, EditorState, Transaction} from "@arrisa/state"
import {InputRule, ensureAnchor, getGroupIndices} from "./input-rule"

function basicSchema() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph])
    return {schema, paragraph, docType}
}

function makeState(text: string, extensions: EditorState.Extension = [], selection?: number) {
    let {schema, paragraph} = basicSchema()
    let doc = schema.doc([paragraph.create(text ? [Leaf.text(text)] : [])])
    // Cursor after last char of the paragraph body (pos 1 is before first char)
    let cursor = selection ?? 1 + text.length
    return EditorState.create({
        doc,
        selection: EditorSelection.cursor(cursor),
        config: [EditorState.schemaElement.of(schema.elements), extensions],
    })
}

describe("ensureAnchor", () => {
    it("leaves an already-anchored indices regex alone when possible", () => {
        let re = /--$/d
        let out = ensureAnchor(re)
        // May return same instance when no changes needed
        expect(out.source).toContain("--")
        expect(out.source.endsWith("$") || out.source.endsWith(")$")).toBe(true)
    })

    it("appends $ when the pattern is not end-anchored", () => {
        let out = ensureAnchor(/abc/)
        expect(out.test("xxabc")).toBe(true)
        expect(out.test("abcxx")).toBe(false)
    })

    it("adds the d flag when hasIndices is false", () => {
        let re = /x$/
        // Without d flag, hasIndices is false
        expect((re as any).hasIndices).toBe(false)
        let out = ensureAnchor(re)
        expect((out as any).hasIndices).toBe(true)
    })
})

describe("getGroupIndices", () => {
    it("uses native indices when present", () => {
        let re = /(a)(b)/d
        let m = "ab".match(re)!
        expect(m).toBeTruthy()
        let indices = getGroupIndices(m)
        expect(indices[0]).toEqual([0, 2])
        expect(indices[1]).toEqual([0, 1])
        expect(indices[2]).toEqual([1, 2])
    })

    it("falls back to scanning group substrings without indices", () => {
        let m = "hello".match(/(he)(llo)/)!
        // Force no indices
        delete (m as any).indices
        let indices = getGroupIndices(m)
        expect(indices[0]).toEqual([0, 5])
        expect(indices[1]).toEqual([0, 2])
        expect(indices[2]).toEqual([2, 5])
    })
})

describe("InputRule", () => {
    it("replaces -- with an em dash after input.type", () => {
        let state = makeState("-", InputRule.emDash.extension)
        // Type second "-" so text before cursor is "--"
        let tr = state.update({
            changes: {from: 2, to: 2, insert: Slice.of([Leaf.text("-")])},
            selection: EditorSelection.cursor(3),
            userEvent: "input.type",
        })
        let chain = Transaction.append(tr)
        expect(chain[chain.length - 1].state.doc.textContent()).toBe("—")
    })

    it("does not fire without an input.type user event", () => {
        let state = makeState("--", InputRule.emDash.extension)
        let tr = state.update({
            changes: {from: 3, to: 3, insert: Slice.of([Leaf.text("x")])},
            selection: EditorSelection.cursor(4),
        })
        let chain = Transaction.append(tr)
        expect(chain.length).toBe(1)
        expect(chain[0].state.doc.textContent()).toBe("--x")
    })

    it("applies a string replacement from define", () => {
        let rule = InputRule.define({expr: /foo$/, apply: "bar"})
        let state = makeState("fo", rule.extension)
        let tr = state.update({
            changes: {from: 3, to: 3, insert: Slice.of([Leaf.text("o")])},
            selection: EditorSelection.cursor(4),
            userEvent: "input.type",
        })
        let chain = Transaction.append(tr)
        expect(chain[chain.length - 1].state.doc.textContent()).toBe("bar")
    })
})
