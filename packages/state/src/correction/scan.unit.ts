import {describe, expect, it} from "vitest"
import {ChangeSet, Leaf, Mark, Plot, Schema, Slice} from "@arrisa/doc"
import {Correction} from "./correction"
import {CorrectionEvent, scanChanges} from "./scan"

function basicSchema() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let bold = Mark.define("strong", {shape: {element: "strong"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph, bold])
    return {schema, paragraph, bold, docType}
}

describe("scanChanges", () => {
    let {schema, paragraph, bold} = basicSchema()

    function doc(text: string) {
        return schema.doc([paragraph.create([Leaf.text(text)])])
    }

    it("returns empty plan for empty changes", () => {
        let d = doc("hi")
        let plan = scanChanges(ChangeSet.empty(d.length), d, [
            Correction.onContent(paragraph, () => null),
        ])
        expect(plan).toEqual([])
    })

    it("fires Content on ancestors of a replace", () => {
        let d = doc("hello")
        let change = ChangeSet.create(d, {from: 2, to: 2, insert: Slice.of([Leaf.text("X")])})
        let next = change.apply(d)
        let content = Correction.onContent(paragraph, () => null)
        let plan = scanChanges(change, next, [content])
        expect(plan.length).toBeGreaterThan(0)
        expect(plan.every((e) => e.correction == content)).toBe(true)
        expect(plan.some((e) => e.node.node.type == paragraph.type || e.node.node.name == "paragraph")).toBe(true)
    })

    it("fires ChildList when a sibling is inserted", () => {
        let d = schema.doc([paragraph.create([Leaf.text("a")])])
        // single paragraph "a": length 3 (open + char + close); insert after it at 3
        expect(d.length).toBe(3)
        let change = ChangeSet.create(d, {
            from: 3,
            to: 3,
            insert: Slice.of([paragraph.create([Leaf.text("b")])]),
        })
        let next = change.apply(d)
        expect(next.content.length).toBe(2)

        let childList = Correction.onChildList(schema.docTag, () => null)
        let plan = scanChanges(change, next, [childList])
        expect(plan.some((e) => e.correction == childList)).toBe(true)
        // Doc is the parent whose children changed
        expect(plan.some((e) => e.node.node.isPlot && e.node.node.isDoc)).toBe(true)
    })

    it("fires Marks for mark-mod keep sections", () => {
        let d = doc("hi")
        let change = ChangeSet.create(d, {from: 1, to: 3, add: bold})
        let next = change.apply(d)
        let marks = Correction.onMarks(Leaf.Text, () => null)
        let plan = scanChanges(change, next, [marks])
        expect(plan.length).toBeGreaterThan(0)
        expect(plan.every((e) => e.correction == marks)).toBe(true)
    })

    it("does not double-query the same parent for Content", () => {
        let d = doc("abcd")
        // two separate replace sections that both sit inside the same paragraph
        let change = ChangeSet.create(d, [
            {from: 1, to: 2, insert: Slice.of([Leaf.text("X")])},
            {from: 3, to: 4, insert: Slice.of([Leaf.text("Y")])},
        ])
        let next = change.apply(d)
        let content = Correction.onContent(paragraph, () => null)
        let plan = scanChanges(change, next, [content])
        let paraHits = plan.filter((e) => e.correction == content)
        // paragraph should appear at most once despite two replaces
        expect(paraHits.length).toBe(1)
    })

    it("includes multiple corrections in one plan", () => {
        let d = doc("hi")
        let change = ChangeSet.create(d, {from: 1, to: 1, insert: Slice.of([Leaf.text("!")])})
        let next = change.apply(d)
        let a = Correction.onContent(paragraph, () => null)
        let b = Correction.onContent(paragraph, () => null)
        let plan = scanChanges(change, next, [a, b])
        expect(plan.some((e) => e.correction == a)).toBe(true)
        expect(plan.some((e) => e.correction == b)).toBe(true)
    })

    it("buckets events correctly", () => {
        expect(Correction.onChildList(paragraph, () => null).event).toBe(CorrectionEvent.ChildList)
        expect(Correction.onContent(paragraph, () => null).event).toBe(CorrectionEvent.Content)
        expect(Correction.onMarks(Leaf.Text, () => null).event).toBe(CorrectionEvent.Marks)
    })
})
