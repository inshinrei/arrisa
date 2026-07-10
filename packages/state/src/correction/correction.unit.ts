import {describe, expect, it} from "vitest"
import {ChangeSet, Leaf, Plot, Schema, Slice} from "@arrisa/doc"
import {EditorState} from "../state"
import {Transaction} from "../transaction"
import {Correction} from "./correction"
import {CorrectionEvent} from "./scan"

function basicSchema() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph])
    return {schema, paragraph, docType}
}

describe("Correction factories", () => {
    let {paragraph} = basicSchema()

    it("sets event kinds", () => {
        expect(Correction.onChildList(paragraph, () => null).event).toBe(CorrectionEvent.ChildList)
        expect(Correction.onContent(paragraph, () => null).event).toBe(CorrectionEvent.Content)
        expect(Correction.onMarks(paragraph, () => null).event).toBe(CorrectionEvent.Marks)
    })

    it("exposes an extension array", () => {
        let c = Correction.onContent(paragraph, () => null)
        expect(Array.isArray(c.extension)).toBe(true)
        expect((c.extension as unknown[]).length).toBe(2)
    })
})

describe("Correction.check", () => {
    let {schema, paragraph} = basicSchema()

    function doc(text: string) {
        return schema.doc([paragraph.create([Leaf.text(text)])])
    }

    it("returns null for empty list or empty changes", () => {
        let d = doc("hi")
        let change = ChangeSet.create(d, {from: 1, to: 1, insert: Slice.of([Leaf.text("x")])})
        expect(Correction.check(change, change.apply(d), [])).toBeNull()
        expect(Correction.check(ChangeSet.empty(d.length), d, [Correction.onContent(paragraph, () => ({from: 0, to: 0}))])).toBeNull()
    })

    it("composes non-null corrector results", () => {
        let d = doc("hello")
        let change = ChangeSet.create(d, {from: 2, to: 2, insert: Slice.of([Leaf.text("X")])})
        let next = change.apply(d)
        // Append "!" at end of paragraph content (before close)
        let corr = Correction.onContent(paragraph, (node) => {
            let end = node.pos + node.node.length - 1
            return {from: end, to: end, insert: Slice.of([Leaf.text("!")])}
        })
        let result = Correction.check(change, next, [corr])
        expect(result).not.toBeNull()
        let fixed = result!.apply(next)
        expect(fixed.textContent()).toContain("!")
    })

    it("ignores correctors that return null", () => {
        let d = doc("hi")
        let change = ChangeSet.create(d, {from: 1, to: 1, insert: Slice.of([Leaf.text("x")])})
        let next = change.apply(d)
        let corr = Correction.onContent(paragraph, () => null)
        expect(Correction.check(change, next, [corr])).toBeNull()
    })
})

describe("Correction.scan", () => {
    let {schema, paragraph} = basicSchema()

    it("full-document scan produces an update when corrector fires", () => {
        let d = schema.doc([paragraph.create([Leaf.text("ab")])])
        let corr = Correction.onContent(paragraph, (node) => {
            // insert "!" after first char of content
            let at = node.pos + 2
            return {from: at, to: at, insert: Slice.of([Leaf.text("!")])}
        })
        let state = EditorState.create({
            doc: d,
            config: [EditorState.schemaElement.of(schema.elements), corr.extension],
        })
        let tr = corr.scan(state)
        expect(tr).not.toBeNull()
        expect(tr!.docChanged).toBe(true)
        expect(tr!.newDoc.textContent()).toContain("!")
    })

    it("returns null when nothing to fix", () => {
        let d = schema.doc([paragraph.create([Leaf.text("ab")])])
        let corr = Correction.onContent(paragraph, () => null)
        let state = EditorState.create({
            doc: d,
            config: [EditorState.schemaElement.of(schema.elements), corr.extension],
        })
        expect(corr.scan(state)).toBeNull()
    })
})

describe("Correction.extend via EditorState.update", () => {
    let {schema, paragraph} = basicSchema()

    it("applies correction changes sequentially after a local edit", () => {
        let d = schema.doc([paragraph.create([Leaf.text("hi")])])
        let corr = Correction.onContent(paragraph, (node) => {
            let end = node.pos + node.node.length - 1
            return {from: end, to: end, insert: Slice.of([Leaf.text("!")])}
        })
        let state = EditorState.create({
            doc: d,
            config: [EditorState.schemaElement.of(schema.elements), corr.extension],
        })
        let tr = state.update({
            changes: {from: 1, to: 1, insert: Slice.of([Leaf.text("X")])},
        })
        // Base insert "X" plus correction "!"
        expect(tr.newDoc.textContent()).toMatch(/X/)
        expect(tr.newDoc.textContent()).toContain("!")
        // Correction should have enlarged the change set beyond the base insert alone
        expect(tr.changes.newLength).toBeGreaterThan(
            ChangeSet.create(d, {from: 1, to: 1, insert: Slice.of([Leaf.text("X")])}).newLength,
        )
    })

    it("skips remote transactions", () => {
        let d = schema.doc([paragraph.create([Leaf.text("hi")])])
        let calls = 0
        let corr = Correction.onContent(paragraph, () => {
            calls++
            return {from: 1, to: 1, insert: Slice.of([Leaf.text("!")])}
        })
        let state = EditorState.create({
            doc: d,
            config: [EditorState.schemaElement.of(schema.elements), corr.extension],
        })
        let tr = state.update({
            changes: {from: 1, to: 1, insert: Slice.of([Leaf.text("X")])},
            annotations: Transaction.remote.of(true),
        })
        expect(calls).toBe(0)
        expect(tr.newDoc.textContent()).toBe("Xhi")
        expect(tr.newDoc.textContent()).not.toContain("!")
    })

    it("does not extend when the document is unchanged", () => {
        let d = schema.doc([paragraph.create([Leaf.text("hi")])])
        let calls = 0
        let corr = Correction.onContent(paragraph, () => {
            calls++
            return null
        })
        let state = EditorState.create({
            doc: d,
            config: [EditorState.schemaElement.of(schema.elements), corr.extension],
        })
        let tr = state.update({selection: {anchor: 1, head: 2}})
        expect(tr.docChanged).toBe(false)
        expect(calls).toBe(0)
    })
})
