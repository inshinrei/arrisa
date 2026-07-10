import {describe, expect, it} from "vitest"
import {ChangeSet} from "@arrisa/doc"
import {doUnwrapBlock, findUnwrappable, findWrappable, wrapBlockRange} from "./wrap"
import {para, testSchema} from "./test-helpers"

describe("findWrappable + wrapBlockRange", () => {
    it("finds a range and wraps paragraphs in a blockquote", () => {
        let s = testSchema()
        let doc = s.schema.doc([para(s, "a"), para(s, "b")])
        let from = doc.resolve(1)
        let to = doc.resolve(doc.length - 1)
        let range = findWrappable(from, to, s.blockquote)
        expect(range).not.toBeNull()
        let changes = wrapBlockRange(range!, s.blockquote)
        let next = ChangeSet.create(doc, changes).apply(doc)
        expect(next.content.length).toBe(1)
        expect(next.content[0].name).toBe("blockquote")
        expect((next.content[0] as any).content.length).toBe(2)
        expect(next.textContent().replace(/\n/g, "")).toBe("ab")
    })

    it("returns null when the wrapper is not allowed", () => {
        let s = testSchema()
        // list_item is not allowed as a direct child of doc (only via bullet_list)
        let doc = s.schema.doc([para(s, "a")])
        let from = doc.resolve(1)
        let to = doc.resolve(2)
        expect(findWrappable(from, to, s.listItem)).toBeNull()
    })
})

describe("findUnwrappable + doUnwrapBlock", () => {
    it("unwraps a blockquote into the parent document", () => {
        let s = testSchema()
        let doc = s.schema.doc([s.blockquote.create([para(s, "hi"), para(s, "yo")])])
        let from = doc.resolve(2)
        let to = doc.resolve(doc.length - 2)
        let candidates = findUnwrappable(s.schema, from, to)
        expect(candidates).not.toBeNull()
        expect(candidates!.length).toBeGreaterThan(0)
        let block = candidates![0]
        let changes = doUnwrapBlock(block)
        let next = ChangeSet.create(doc, changes).apply(doc)
        expect(next.content.every((n) => n.name == "paragraph")).toBe(true)
        expect(next.content.length).toBe(2)
        expect(next.textContent().replace(/\n/g, "")).toBe("hiyo")
    })
})
