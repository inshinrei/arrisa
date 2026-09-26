import {describe, expect, it} from "vitest"
import {Leaf, Mark} from "@arrisa/doc"
import {Arrisa} from "@arrisa/editor"
import {EditorSelection, EditorState} from "@arrisa/state"
import {Code, CodeBlock, Link, Paragraph} from "@arrisa/types"
import {composeField} from "./compose-field"
import {docPosAtDumpOffset} from "./dump-pos"
import {formattedTextToDoc} from "./from-formatted"
import {MentionName} from "./schema-elements"
import {detectMentionQuery} from "./mention-query"
import {
    detectSchedulePhrases,
    detectScheduleQuery,
    scheduleQueryConfig,
    scheduleQueryListener,
    type ScheduleQuery,
} from "./schedule-query"

const NOW = new Date(2026, 8, 26, 15, 0, 0)
const now = () => new Date(NOW.getTime())
const opts = {now, locale: "en"}

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

describe("detectScheduleQuery", () => {
    it("hits ok got tomorrow at 14:00 with caret at end", () => {
        let text = "ok got tomorrow at 14:00"
        let state = composeState(text, text.length)
        expect(detectScheduleQuery(state, opts)).toEqual({
            from: 7,
            to: 24,
            phrase: "tomorrow at 14:00",
            label: "tomorrow at 14:00",
            scheduledTime: Math.floor(new Date(2026, 8, 27, 14, 0, 0, 0).getTime() / 1000),
        })
    })

    it("returns null for tomorrow at 14:", () => {
        expect(detectScheduleQuery(composeState("tomorrow at 14:", 15), opts)).toBeNull()
    })

    it("returns null for today at 09:00 when now is 15:00", () => {
        expect(detectScheduleQuery(composeState("today at 09:00", 14), opts)).toBeNull()
    })

    it("returns null inside inline code", () => {
        let config = hostCompose()
        let proto = EditorState.create({doc: "", config})
        let doc = proto.schema.doc([
            Paragraph.create([Leaf.text("tomorrow at 14:00", Code.addToSet(Mark.none))]),
        ])
        let pos = docPosAtDumpOffset(doc, 17, "to")
        if (pos === false) throw new Error("bad caret")
        let state = EditorState.create({doc, selection: EditorSelection.cursor(pos), config})
        expect(detectScheduleQuery(state, opts)).toBeNull()
    })

    it("returns null inside a code block", () => {
        let config = hostCompose()
        let proto = EditorState.create({doc: "", config})
        let doc = proto.schema.doc([CodeBlock.create([Leaf.text("tomorrow at 14:00")])])
        let pos = docPosAtDumpOffset(doc, 17, "to")
        if (pos === false) throw new Error("bad caret")
        let state = EditorState.create({doc, selection: EditorSelection.cursor(pos), config})
        expect(detectScheduleQuery(state, opts)).toBeNull()
    })

    it("returns null while a mention query is active", () => {
        let state = composeState("tomorrow at 14:00 @al", 21)
        expect(detectMentionQuery(state)).not.toBeNull()
        expect(detectScheduleQuery(state, opts)).toBeNull()
    })

    it("returns null when the caret is past the phrase", () => {
        let text = "tomorrow at 14:00 later"
        expect(detectScheduleQuery(composeState(text, text.length), opts)).toBeNull()
    })

    it("returns null when enabled is false", () => {
        let state = composeState("tomorrow at 14:00", 17)
        expect(detectScheduleQuery(state, {now, enabled: () => false})).toBeNull()
    })

    it("returns null when the phrase overlaps a text_url", () => {
        let config = hostCompose()
        let proto = EditorState.create({doc: "", config})
        let doc = proto.schema.doc([
            Paragraph.create([Leaf.text("tomorrow at 14:00", Link.of("https://example.com").addToSet(Mark.none))]),
        ])
        let pos = docPosAtDumpOffset(doc, 17, "to")
        if (pos === false) throw new Error("bad caret")
        let state = EditorState.create({doc, selection: EditorSelection.cursor(pos), config})
        expect(detectScheduleQuery(state, opts)).toBeNull()
        expect(detectSchedulePhrases(state, opts)).toEqual([])
    })

    it("returns null inside a MentionName mark", () => {
        let config = hostCompose()
        let proto = EditorState.create({doc: "", config})
        let doc = proto.schema.doc([
            Paragraph.create([Leaf.text("tomorrow at 14:00", MentionName.of("u@ex").addToSet(Mark.none))]),
        ])
        let pos = docPosAtDumpOffset(doc, 17, "to")
        if (pos === false) throw new Error("bad caret")
        let state = EditorState.create({
            doc,
            selection: EditorSelection.cursor(pos),
            config,
        })
        expect(detectScheduleQuery(state, opts)).toBeNull()
    })

    it("hits when the caret is at the start of the phrase", () => {
        let text = "ok got tomorrow at 14:00"
        expect(detectScheduleQuery(composeState(text, 7), opts)).toEqual({
            from: 7,
            to: 24,
            phrase: "tomorrow at 14:00",
            label: "tomorrow at 14:00",
            scheduledTime: Math.floor(new Date(2026, 8, 27, 14, 0, 0, 0).getTime() / 1000),
        })
    })

    it("returns null when the caret is not collapsed", () => {
        let state = composeState("tomorrow at 14:00", 17)
        state = state.update({selection: EditorSelection.range(0, 17)}).state
        expect(detectScheduleQuery(state, opts)).toBeNull()
    })

    it("returns null when the facet disables detection", () => {
        let config = [hostCompose(), scheduleQueryConfig.of({now, enabled: () => false})]
        let proto = EditorState.create({doc: "", config})
        let doc = formattedTextToDoc({text: "tomorrow at 14:00"}, proto.schema)
        let pos = docPosAtDumpOffset(doc, 17, "to")
        if (pos === false) throw new Error("bad caret")
        let state = EditorState.create({
            doc,
            selection: EditorSelection.cursor(pos),
            config,
        })
        expect(detectScheduleQuery(state)).toBeNull()
    })
})

describe("detectSchedulePhrases", () => {
    it("returns every in-window phrase for paint", () => {
        let text = "ok got tomorrow at 14:00"
        expect(detectSchedulePhrases(composeState(text, text.length), opts)).toEqual([
            {
                from: 7,
                to: 24,
                phrase: "tomorrow at 14:00",
                label: "tomorrow at 14:00",
                scheduledTime: Math.floor(new Date(2026, 8, 27, 14, 0, 0, 0).getTime() / 1000),
            },
        ])
    })

    it("still paints a phrase while a mention query is active", () => {
        let state = composeState("tomorrow at 14:00 @al", 21)
        expect(detectMentionQuery(state)).not.toBeNull()
        expect(detectSchedulePhrases(state, opts)).toEqual([
            {
                from: 0,
                to: 17,
                phrase: "tomorrow at 14:00",
                label: "tomorrow at 14:00",
                scheduledTime: Math.floor(new Date(2026, 8, 27, 14, 0, 0, 0).getTime() / 1000),
            },
        ])
    })

    it("returns empty when enabled is false", () => {
        expect(detectSchedulePhrases(composeState("tomorrow at 14:00", 17), {now, enabled: () => false})).toEqual([])
    })
})

describe("scheduleQueryListener", () => {
    it("emits a query with rect and null when unfocused", () => {
        let seen: Array<ScheduleQuery | null> = []
        let config = [hostCompose(), scheduleQueryListener((q) => seen.push(q), opts)]
        let proto = EditorState.create({doc: "", config})
        let doc = formattedTextToDoc({text: "tomorrow at 14:00"}, proto.schema)
        let pos = docPosAtDumpOffset(doc, 17, "to")
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
            to: 17,
            phrase: "tomorrow at 14:00",
            label: "tomorrow at 14:00",
            scheduledTime: Math.floor(new Date(2026, 8, 27, 14, 0, 0, 0).getTime() / 1000),
            rect: {top: 12, left: 8, width: 0, height: 16},
        })
        editor.hasFocus = false
        listener(update as unknown as Arrisa.Update)
        expect(seen.at(-1)).toBeNull()
    })
})
