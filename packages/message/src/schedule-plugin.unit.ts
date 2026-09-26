import {describe, expect, it} from "vitest"
import {Attributes, type Elt} from "@arrisa/doc"
import {Command} from "@arrisa/command"
import {Arrisa, Decoration, KeyBinding, Tooltip, type Tooltip as TooltipT} from "@arrisa/editor"
import {phrases} from "@arrisa/phrases"
import {EditorSelection, EditorState, type Transaction} from "@arrisa/state"
import {composeField} from "./compose-field"
import {docPosAtDumpOffset} from "./dump-pos"
import {formattedTextToDoc} from "./from-formatted"
import {acceptScheduleQuery} from "./schedule-accept"
import {scheduleQuery} from "./schedule-plugin"
import type {ScheduleQuery, ScheduleQueryConfig} from "./schedule-query"

const NOW = new Date(2026, 8, 26, 15, 0, 0)
const now = () => new Date(NOW.getTime())

function hostCompose() {
    return composeField({
        floating: false,
        placeholder: false,
        markdown: false,
        markdownPaste: false,
        hostElements: true,
    })
}

function wrapperClass(deco: Decoration.Range): string | null {
    if (!("elt" in deco)) return null
    let elt = (deco as {elt: Elt}).elt
    return Attributes.get(elt.attrs, "class")
}

function schedulePaint(state: EditorState) {
    let found: {from: number; to: number}[] = []
    for (let source of state.facet(Decoration.Range.source)) {
        let set = source(state)
        for (let i = 0; i < set.length; i++) {
            if (wrapperClass(set.values[i]!)?.includes("arrisa-schedule-phrase")) {
                found.push({from: set.from[i]!, to: set.to[i]!})
            }
        }
    }
    return found
}

function isScheduleChip(t: TooltipT | null): t is TooltipT {
    return !!t && t.above === true && t.strictSide === true
}

function stateFor(text: string, caretDump = text.length, extra: ScheduleQueryConfig = {}) {
    let config = [
        hostCompose(),
        scheduleQuery({now, locale: "en", ...extra}),
    ]
    let proto = EditorState.create({doc: "", config})
    let doc = formattedTextToDoc({text}, proto.schema)
    let pos = docPosAtDumpOffset(doc, caretDump, "to")
    if (pos === false) throw new Error("bad caret")
    return EditorState.create({doc, selection: EditorSelection.cursor(pos), config})
}

function fakeEditor(state: EditorState) {
    let editor = {
        state,
        hasFocus: true,
        selectionRect: () => ({top: 12, left: 8, width: 0, height: 16}),
        dispatch(...specs: Transaction.Spec[]) {
            for (let spec of specs) {
                let startState = editor.state
                let tr = editor.state.update(spec)
                editor.state = tr.state
                let update = {
                    editor,
                    startState,
                    state: tr.state,
                    transactions: [tr],
                    get docChanged() {
                        return tr.docChanged
                    },
                    get selectionSet() {
                        return !!tr.selection
                    },
                    get focusChanged() {
                        return false
                    },
                }
                for (let listener of editor.state.facet(Arrisa.updateListener)) {
                    listener(update as unknown as Arrisa.Update)
                }
            }
        },
    }
    return editor
}

function runKey(editor: ReturnType<typeof fakeEditor>, key: string) {
    let binding = editor.state.facet(KeyBinding.source).find((b) => b.spec.key == key)
    if (!binding) throw new Error("missing " + key)
    let run = binding.spec.run
    let result = typeof run == "function" ? run(editor as never, null) : Command.dispatch(editor as never, run)
    if (result && typeof result != "boolean") editor.dispatch(result)
    return result
}

describe("scheduleQuery paint", () => {
    it("wraps the phrase in arrisa-schedule-phrase", () => {
        let text = "ok got tomorrow at 14:00"
        let state = stateFor(text)
        let from = docPosAtDumpOffset(state.doc, 7, "from")
        let to = docPosAtDumpOffset(state.doc, 24, "to")
        expect(from).not.toBe(false)
        expect(to).not.toBe(false)
        expect(schedulePaint(state)).toContainEqual({from, to})
    })

    it("paints nothing when enabled is false", () => {
        let state = stateFor("ok got tomorrow at 14:00", undefined, {enabled: () => false})
        expect(schedulePaint(state)).toEqual([])
    })
})

describe("scheduleQuery chip tooltip", () => {
    it("omits the Arrisa chip when onQuery is set but still paints", () => {
        let state = stateFor("ok got tomorrow at 14:00", undefined, {onQuery: () => {}})
        expect(state.facet(Tooltip.show).filter(isScheduleChip)).toEqual([])
        expect(schedulePaint(state).length).toBe(1)
    })

    it("shows a chip above the phrase when onQuery is omitted", () => {
        let state = stateFor("ok got tomorrow at 14:00")
        let chips = state.facet(Tooltip.show).filter(isScheduleChip)
        expect(chips.length).toBe(1)
        expect(chips[0]!.arrow).toBeFalsy()
        expect(chips[0]!.strictSide).toBe(true)
        expect(chips[0]!.above).toBe(true)
        expect(chips[0]!.pos).toBe(docPosAtDumpOffset(state.doc, 24, "to"))
        expect(typeof chips[0]!.create).toBe("function")
    })
})

describe("scheduleQuery keymap", () => {
    it("installs ArrowUp / Enter / Escape / ArrowDown", () => {
        let state = stateFor("ok got tomorrow at 14:00")
        let keys = state.facet(KeyBinding.source).map((b) => b.spec.key)
        expect(keys).toContain("ArrowUp")
        expect(keys).toContain("Enter")
        expect(keys).toContain("Escape")
        expect(keys).toContain("ArrowDown")
    })

    it("falls through Enter when the chip is unfocused and accepts after ArrowUp", () => {
        let editor = fakeEditor(stateFor("ok got tomorrow at 14:00"))
        expect(runKey(editor, "Enter")).toBe(false)
        expect(editor.state.doc.textContent()).toBe("ok got tomorrow at 14:00")
        expect(runKey(editor, "ArrowUp")).toBe(true)
        let result = runKey(editor, "Enter")
        expect(result).not.toBe(false)
        expect(editor.state.doc.textContent()).toBe("ok got")
    })

    it("blurs a focused chip on ArrowDown without accepting", () => {
        let editor = fakeEditor(stateFor("ok got tomorrow at 14:00"))
        expect(runKey(editor, "ArrowUp")).toBe(true)
        expect(runKey(editor, "ArrowDown")).toBe(true)
        expect(editor.state.doc.textContent()).toBe("ok got tomorrow at 14:00")
        expect(runKey(editor, "Enter")).toBe(false)
        expect(editor.state.facet(Tooltip.show).filter(isScheduleChip).length).toBe(1)
    })

    it("hides the chip on Escape while unfocused and refocuses from hidden via ArrowUp", () => {
        let editor = fakeEditor(stateFor("ok got tomorrow at 14:00"))
        expect(editor.state.facet(Tooltip.show).filter(isScheduleChip).length).toBe(1)
        expect(runKey(editor, "Escape")).toBe(true)
        expect(editor.state.facet(Tooltip.show).filter(isScheduleChip)).toEqual([])
        expect(schedulePaint(editor.state).length).toBe(1)
        expect(runKey(editor, "Enter")).toBe(false)
        expect(runKey(editor, "ArrowUp")).toBe(true)
        expect(editor.state.facet(Tooltip.show).filter(isScheduleChip).length).toBe(1)
        expect(runKey(editor, "Enter")).not.toBe(false)
        expect(editor.state.doc.textContent()).toBe("ok got")
    })
})

describe("scheduleQuery onQuery", () => {
    it("emits null on Escape hide while paint stays", () => {
        let seen: Array<ScheduleQuery | null> = []
        let editor = fakeEditor(
            stateFor("ok got tomorrow at 14:00", undefined, {onQuery: (q) => seen.push(q)}),
        )
        editor.dispatch({selection: editor.state.selection})
        expect(seen.at(-1)).toMatchObject({phrase: "tomorrow at 14:00"})
        expect(runKey(editor, "Escape")).toBe(true)
        expect(seen.at(-1)).toBeNull()
        expect(schedulePaint(editor.state).length).toBe(1)
    })

    it("emits a query again after ArrowUp from hidden", () => {
        let seen: Array<ScheduleQuery | null> = []
        let editor = fakeEditor(
            stateFor("ok got tomorrow at 14:00", undefined, {onQuery: (q) => seen.push(q)}),
        )
        expect(runKey(editor, "Escape")).toBe(true)
        expect(seen.at(-1)).toBeNull()
        expect(runKey(editor, "ArrowUp")).toBe(true)
        expect(seen.at(-1)).toMatchObject({phrase: "tomorrow at 14:00"})
    })

    it("falls through a second Escape while already hidden", () => {
        let editor = fakeEditor(stateFor("ok got tomorrow at 14:00", undefined, {onQuery: () => {}}))
        expect(runKey(editor, "Escape")).toBe(true)
        expect(runKey(editor, "Escape")).toBe(false)
    })
})

describe("scheduleQuery onAccept", () => {
    it("fires once when the accept effect is delivered", () => {
        let accepted: Omit<ScheduleQuery, "rect">[] = []
        let state = stateFor("ok got tomorrow at 14:00", undefined, {onAccept: (h) => accepted.push(h)})
        let spec = acceptScheduleQuery({state}, null)
        expect(spec).not.toBe(false)
        let tr = state.update(spec as Exclude<typeof spec, false>)
        let editor = {
            hasFocus: true,
            state: tr.state,
            selectionRect: () => ({top: 12, left: 8, width: 0, height: 16}),
        }
        let update = {
            editor,
            startState: state,
            state: tr.state,
            transactions: [tr],
            get docChanged() {
                return true
            },
            get selectionSet() {
                return true
            },
            get focusChanged() {
                return false
            },
        }
        for (let listener of state.facet(Arrisa.updateListener)) {
            listener(update as unknown as Arrisa.Update)
        }
        expect(accepted).toHaveLength(1)
        expect(accepted[0]!.phrase).toBe("tomorrow at 14:00")
        expect(accepted[0]!).not.toHaveProperty("rect")
    })
})

describe("schedule_suggestion phrase", () => {
    it("is Schedule {phrase}", () => {
        let state = stateFor("ok got tomorrow at 14:00")
        expect(phrases.get(state, "schedule_suggestion")).toBe("Schedule {phrase}")
    })
})
