import {describe, expect, it} from "vitest"
import {EditorSelection, EditorState, Transaction} from "@arrisa/state"
import {composeField} from "./compose-field"
import {docPosAtDumpOffset} from "./dump-pos"
import {formattedTextToDoc} from "./from-formatted"
import {docToFormattedText} from "./to-formatted"
import {scheduleQueryConfig} from "./schedule-query"
import {acceptScheduleQuery, scheduleAccepted} from "./schedule-accept"

const NOW = new Date(2026, 8, 26, 15, 0, 0)
const now = () => new Date(NOW.getTime())

function stateFor(text: string, caretDump = text.length) {
    let config = [
        composeField({floating: false, placeholder: false, markdown: false, markdownPaste: false, hostElements: true}),
        scheduleQueryConfig.of({now, locale: "en"}),
    ]
    let proto = EditorState.create({doc: "", config})
    let doc = formattedTextToDoc({text}, proto.schema)
    let pos = docPosAtDumpOffset(doc, caretDump, "to")
    if (pos === false) throw new Error("bad caret")
    return EditorState.create({doc, selection: EditorSelection.cursor(pos), config})
}

describe("acceptScheduleQuery", () => {
    it("deletes the phrase and the preceding space from ok got tomorrow at 14:00", () => {
        let state = stateFor("ok got tomorrow at 14:00")
        let spec = acceptScheduleQuery({state}, null)
        expect(spec).not.toBe(false)
        let tr = state.update(spec as Exclude<typeof spec, false>)
        expect(tr.annotation(Transaction.userEvent)).toBe("delete.schedule-query")
        expect(tr.state.doc.textContent()).toBe("ok got")
        expect(docToFormattedText(tr.state.doc).text).toBe("ok got")
        expect(
            tr.effects.some(
                (e) =>
                    e.is(scheduleAccepted) &&
                    e.value.phrase == "tomorrow at 14:00" &&
                    e.value.from == 7 &&
                    e.value.to == 24,
            ),
        ).toBe(true)
        expect(
            docToFormattedText(tr.state.doc).entities?.some((e) => {
                let type = e.type as string
                return type == "datetime" || type == "schedule"
            }),
        ).toBeFalsy()
    })

    it("deletes a leading phrase and the following space", () => {
        let state = stateFor("tomorrow at 14:00 later", 17)
        let spec = acceptScheduleQuery({state}, null)
        expect(spec).not.toBe(false)
        let tr = state.update(spec as Exclude<typeof spec, false>)
        expect(tr.state.doc.textContent()).toBe("later")
    })

    it("collapses a doubled interior space", () => {
        let state = stateFor("ok got tomorrow at 14:00 later", 24)
        let spec = acceptScheduleQuery({state}, null)
        expect(spec).not.toBe(false)
        let tr = state.update(spec as Exclude<typeof spec, false>)
        expect(tr.state.doc.textContent()).toBe("ok got later")
    })

    it("is a no-op without a hit", () => {
        let state = stateFor("hello")
        expect(acceptScheduleQuery({state}, null)).toBe(false)
    })
})
