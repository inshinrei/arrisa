import {describe, expect, it} from "vitest"
import {Leaf, Mark} from "@arrisa/doc"
import {Arrisa} from "@arrisa/editor"
import {EditorSelection, EditorState} from "@arrisa/state"
import {Code, CodeBlock, Paragraph} from "@arrisa/types"
import {composeField} from "./compose-field"
import {docPosAtDumpOffset} from "./dump-pos"
import {formattedTextToDoc} from "./from-formatted"
import {detectMentionQuery, mentionQueryListener, type MentionQuery} from "./mention-query"
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

    it("returns null when the query contains a bracket", () => {
        let state = composeState("@a]", 3)
        expect(detectMentionQuery(state)).toBeNull()
    })

    it("returns null when the query contains whitespace", () => {
        let state = composeState("@a b", 4)
        expect(detectMentionQuery(state)).toBeNull()
    })

    it("returns null when the caret is left of @", () => {
        let state = composeState("@al", 0)
        expect(detectMentionQuery(state)).toBeNull()
    })
})

describe("mentionQueryListener", () => {
    it("emits a query with rect and null when unfocused", () => {
        let seen: Array<MentionQuery | null> = []
        let config = [hostCompose(), mentionQueryListener((q) => seen.push(q))]
        let proto = EditorState.create({doc: "", config})
        let doc = formattedTextToDoc({text: "@"}, proto.schema)
        let pos = docPosAtDumpOffset(doc, 1, "to")
        if (pos === false) throw new Error("bad caret")
        let start = EditorState.create({
            doc,
            selection: EditorSelection.cursor(pos),
            config,
        })
        let tr = start.update({selection: EditorSelection.cursor(pos)})
        let editor = {
            hasFocus: true,
            state: tr.state,
            selectionRect: () => ({top: 12, left: 8, width: 0, height: 16}),
        }
        let listener = start.facet(Arrisa.updateListener)[0]!
        let update = {
            editor,
            startState: start,
            state: tr.state,
            transactions: [tr],
            get docChanged() {
                return false
            },
            get selectionSet() {
                return true
            },
            get focusChanged() {
                return false
            },
        }
        listener(update as unknown as Arrisa.Update)
        expect(seen.at(-1)).toEqual({
            from: 0,
            to: 1,
            query: "",
            rect: {top: 12, left: 8, width: 0, height: 16},
        })
        editor.hasFocus = false
        listener(update as unknown as Arrisa.Update)
        expect(seen.at(-1)).toBeNull()
    })
})
