import {describe, expect, it} from "vitest"
import {Leaf, Mark, Schema} from "@arrisa/doc"
import {InlineDoc} from "@arrisa/types"
import {MentionName} from "./schema-elements"
import {docPosAtDumpOffset, dumpOffsetAtDocPos} from "./dump-pos"
import {docToFormattedText} from "./to-formatted"

function schema() {
    return Schema.define([InlineDoc, MentionName])
}

describe("docPosAtDumpOffset", () => {
    it("maps 1:1 text", () => {
        let s = schema()
        let doc = s.doc([Leaf.text("hi @al")])
        expect(docPosAtDumpOffset(doc, 3, "from")).toBe(3)
        expect(docPosAtDumpOffset(doc, 6, "to")).toBe(6)
    })

    it("returns false out of range", () => {
        let s = schema()
        let doc = s.doc([Leaf.text("hi")])
        expect(docPosAtDumpOffset(doc, 999, "from")).toBe(false)
        expect(docPosAtDumpOffset(doc, -1, "from")).toBe(false)
    })

    it("round-trips dump offsets through textContent space", () => {
        let s = schema()
        let doc = s.doc([Leaf.text("hi @al")])
        let text = docToFormattedText(doc).text
        expect(text).toBe("hi @al")
        let from = docPosAtDumpOffset(doc, 3, "from")
        let to = docPosAtDumpOffset(doc, 6, "to")
        expect(from).not.toBe(false)
        expect(to).not.toBe(false)
        expect(doc.textContent({from: from as number, to: to as number})).toBe("@al")
    })

    it("allows dumpLength only for the to edge", () => {
        let s = schema()
        let doc = s.doc([Leaf.text("hi")])
        expect(docPosAtDumpOffset(doc, 2, "from")).toBe(false)
        expect(docPosAtDumpOffset(doc, 2, "to")).toBe(2)
    })

    it("snaps rewritten mention dump offsets to the mark range", () => {
        let s = schema()
        let doc = s.doc([
            Leaf.text("hi "),
            Leaf.text("Alice", MentionName.of("u@ex").addToSet(Mark.none)),
        ])
        let opts = {mentionText: (userId: string) => `@[${userId}]`}
        expect(docToFormattedText(doc, opts).text).toBe("hi @[u@ex]")
        let from = docPosAtDumpOffset(doc, 3, "from", opts)
        let to = docPosAtDumpOffset(doc, 10, "to", opts)
        expect(from).not.toBe(false)
        expect(to).not.toBe(false)
        expect(doc.textContent({from: from as number, to: to as number})).toBe("Alice")
    })
})

describe("dumpOffsetAtDocPos", () => {
    it("is the inverse of docPosAtDumpOffset to-edge on 1:1 text", () => {
        let s = schema()
        let doc = s.doc([Leaf.text("hi @al")])
        for (let offset = 0; offset <= 6; offset++) {
            let pos = docPosAtDumpOffset(doc, offset, "to")
            expect(pos).not.toBe(false)
            expect(dumpOffsetAtDocPos(doc, pos as number)).toBe(offset)
        }
    })

    it("returns false out of range", () => {
        let s = schema()
        let doc = s.doc([Leaf.text("hi")])
        expect(dumpOffsetAtDocPos(doc, -1)).toBe(false)
        expect(dumpOffsetAtDocPos(doc, 999)).toBe(false)
    })
})

