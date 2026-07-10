import {describe, expect, it} from "vitest"
import {ChangeSet, type Plot, type Pos} from "@arrisa/doc"
import {EditorSelection, EditorState} from "@arrisa/state"
import {autoJoinBlocks, clearNonFitting, joinBlocks, textblockChild} from "./blocks"
import {para, testSchema} from "./test-helpers"

describe("textblockChild", () => {
    it("returns the default textblock tag when the parent can wrap text via one wrapper", () => {
        let s = testSchema()
        // findWrapping(doc, Text) is [paragraph] — length 1
        let child = textblockChild(s.schema, s.docType)
        expect(child?.name).toBe("paragraph")
        // paragraph already holds text directly → empty wrapping path → null
        expect(textblockChild(s.schema, s.paragraph.type)).toBeNull()
    })
})

describe("clearNonFitting", () => {
    it("emits deletes for children the target type cannot contain", () => {
        let s = testSchema()
        let doc = s.schema.doc([s.blockquote.create([para(s, "a")])])
        let bq = doc.resolveNode(0) as Pos.Plot
        // paragraph type cannot contain a paragraph child
        let changes = clearNonFitting(s.schema, bq, s.paragraph.type) as ChangeSet.Spec[]
        expect(Array.isArray(changes)).toBe(true)
        expect(changes.length).toBe(1)
        expect((changes[0] as {from: number; to: number}).from).toBe(bq.start)
        expect((changes[0] as {from: number; to: number}).to).toBe(bq.end)
    })
})

describe("joinBlocks", () => {
    it("collapses the gap between two adjacent paragraphs", () => {
        let s = testSchema()
        let doc = s.schema.doc([para(s, "ab"), para(s, "cd")])
        let first = doc.resolveNode(0) as Pos.Plot
        let second = doc.resolveNode(first.after) as Pos.Plot
        let change = ChangeSet.create(doc, joinBlocks(first, second))
        let next = change.apply(doc)
        expect(next.content.length).toBe(1)
        expect(next.textContent()).toBe("abcd")
    })
})

describe("autoJoinBlocks", () => {
    it("joins adjacent bullet lists when autoJoin is enabled", () => {
        let s = testSchema()
        let mid = s.schema.doc([
            s.bulletList.create([s.listItem.create([para(s, "a")])]),
            para(s, "x"),
            s.bulletList.create([s.listItem.create([para(s, "b")])]),
        ])
        let midState = EditorState.create({
            doc: mid,
            selection: EditorSelection.cursor(1),
            config: [EditorState.schemaElement.of(s.schema.elements)],
        })
        let from = mid.content[0].length
        let to = from + mid.content[1].length
        let joined = autoJoinBlocks(midState, {
            changes: {from, to},
            userEvent: "delete.selection",
        })
        let next = midState.update(joined).state
        expect(next.doc.content.length).toBe(1)
        expect(next.doc.content[0].name).toBe("bullet_list")
        expect((next.doc.content[0] as Plot).content.length).toBe(2)
    })
})
