import {describe, expect, it} from "vitest"
import {Leaf, Mark} from "@arrisa/doc"
import {EditorSelection, EditorState} from "@arrisa/state"
import {Code, CodeBlock, Paragraph} from "@arrisa/types"
import {composeField} from "./compose-field"
import {docPosAtDumpOffset} from "./dump-pos"
import {formattedTextToDoc} from "./from-formatted"
import {detectMentionQuery} from "./mention-query"
import {MentionName} from "./schema-elements"

function hostCompose() {
    return composeField({
        floating: false,
        placeholder: false,
        markdown: false,
        markdownPaste: false,
        hostElements: true,
    })
}

function composeState(text: string, caretDump: number) {
    let config = hostCompose()
    let proto = EditorState.create({doc: "", config})
    let doc = formattedTextToDoc({text}, proto.schema)
    let pos = docPosAtDumpOffset(doc, caretDump, "to")
    if (pos === false) throw new Error("bad caret")
    return EditorState.create({
        doc,
        selection: EditorSelection.cursor(pos),
        config,
    })
}

describe("detectMentionQuery", () => {
    it("opens on word-start @ with empty query", () => {
        let state = composeState("@", 1)
        expect(detectMentionQuery(state)).toEqual({from: 0, to: 1, query: ""})
    })

    it("grows the query for @al", () => {
        let state = composeState("@al", 3)
        expect(detectMentionQuery(state)).toEqual({from: 0, to: 3, query: "al"})
    })

    it("returns null for email-like a@b", () => {
        let state = composeState("a@b", 2)
        expect(detectMentionQuery(state)).toBeNull()
    })

    it("returns null inside a MentionName mark", () => {
        let config = hostCompose()
        let proto = EditorState.create({doc: "", config})
        let doc = proto.schema.doc([
            Paragraph.create([Leaf.text("@[u@ex]", MentionName.of("u@ex").addToSet(Mark.none))]),
        ])
        let head = 2
        let state = EditorState.create({
            doc,
            selection: EditorSelection.cursor(head),
            config,
        })
        expect(state.doc.resolve(head).marks().some((m) => m.type == MentionName || m.name == "MentionName")).toBe(true)
        expect(detectMentionQuery(state)).toBeNull()
    })

    it("returns null after a MentionName whose label is @name", () => {
        let config = hostCompose()
        let proto = EditorState.create({doc: "", config})
        let doc = proto.schema.doc([
            Paragraph.create([Leaf.text("@bob", MentionName.of("u1").addToSet(Mark.none))]),
        ])
        let pos = docPosAtDumpOffset(doc, 4, "to")
        if (pos === false) throw new Error("bad caret")
        let state = EditorState.create({
            doc,
            selection: EditorSelection.cursor(pos),
            config,
        })
        expect(MentionName.isInSet(state.doc.resolve(pos).marks())).toBeFalsy()
        expect(detectMentionQuery(state)).toBeNull()
    })

    it("returns null inside inline code", () => {
        let config = hostCompose()
        let proto = EditorState.create({doc: "", config})
        let doc = proto.schema.doc([Paragraph.create([Leaf.text("@al", Code.addToSet(Mark.none))])])
        let pos = docPosAtDumpOffset(doc, 3, "to")
        if (pos === false) throw new Error("bad caret")
        let state = EditorState.create({
            doc,
            selection: EditorSelection.cursor(pos),
            config,
        })
        expect(detectMentionQuery(state)).toBeNull()
    })

    it("returns null inside a code block", () => {
        let config = hostCompose()
        let proto = EditorState.create({doc: "", config})
        let doc = proto.schema.doc([CodeBlock.create([Leaf.text("@al")])])
        let pos = docPosAtDumpOffset(doc, 3, "to")
        if (pos === false) throw new Error("bad caret")
        let state = EditorState.create({
            doc,
            selection: EditorSelection.cursor(pos),
            config,
        })
        expect(detectMentionQuery(state)).toBeNull()
    })

    it("returns null when the caret is not collapsed", () => {
        let state = composeState("@al", 3)
        state = state.update({selection: EditorSelection.range(1, 3)}).state
        expect(detectMentionQuery(state)).toBeNull()
    })

    it("opens after whitespace", () => {
        let state = composeState("hi @al", 6)
        expect(detectMentionQuery(state)).toEqual({from: 3, to: 6, query: "al"})
    })
})
