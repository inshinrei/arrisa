import {describe, expect, it} from "vitest"
import {Leaf, Plot, Schema, Slice} from "@arrisa/doc"
import {EditorSelection, EditorState, Transaction} from "@arrisa/state"
import {history, undo, redo, undoDepth, redoDepth} from "./index"

function basicSchema() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph])
    return {schema, paragraph, docType}
}

function makeState(text = "hello", extensions: EditorState.Extension = history()) {
    let {schema, paragraph} = basicSchema()
    let doc = schema.doc([paragraph.create([Leaf.text(text)])])
    let state = EditorState.create({
        doc,
        selection: EditorSelection.cursor(1),
        config: [EditorState.schemaElement.of(schema.elements), extensions],
    })
    return {state, schema, paragraph, doc}
}

function apply(state: EditorState, spec: Transaction.Spec) {
    return state.update(spec).state
}

function runCommand(state: EditorState, cmd: typeof undo) {
    let spec = cmd({state})
    if (!spec) return {state, applied: false as const}
    return {state: apply(state, spec), applied: true as const}
}

/** Insert `text` at `from` with controlled time/userEvent for grouping tests. */
function typeAt(
    state: EditorState,
    from: number,
    text: string,
    opts: {time?: number; userEvent?: string; annotations?: Transaction.Spec["annotations"]} = {},
) {
    let {time = 1000, userEvent = "input.type", annotations} = opts
    let ann = [Transaction.time.of(time)]
    if (annotations) ann = ann.concat(Array.isArray(annotations) ? annotations : [annotations])
    return apply(state, {
        changes: {from, to: from, insert: Slice.of([Leaf.text(text)])},
        selection: EditorSelection.cursor(from + text.length),
        userEvent,
        annotations: ann,
    })
}

describe("history recording and undo/redo", () => {
    it("records a change and undoes it, restoring doc and selection", () => {
        let {state} = makeState("hi")
        expect(undoDepth(state)).toBe(0)
        state = typeAt(state, 1, "X", {time: 1})
        expect(state.doc.textContent()).toBe("Xhi")
        expect(undoDepth(state)).toBe(1)
        expect(redoDepth(state)).toBe(0)

        let result = runCommand(state, undo)
        expect(result.applied).toBe(true)
        state = result.state
        expect(state.doc.textContent()).toBe("hi")
        expect(undoDepth(state)).toBe(0)
        expect(redoDepth(state)).toBe(1)
        // Original cursor was at 1 before the insert.
        expect(state.selection.from).toBe(1)
    })

    it("redoes after undo", () => {
        let {state} = makeState("ab")
        state = typeAt(state, 1, "Z", {time: 1})
        state = runCommand(state, undo).state
        expect(state.doc.textContent()).toBe("ab")
        let result = runCommand(state, redo)
        expect(result.applied).toBe(true)
        state = result.state
        expect(state.doc.textContent()).toBe("Zab")
        expect(undoDepth(state)).toBe(1)
        expect(redoDepth(state)).toBe(0)
    })

    it("returns false when there is nothing to undo or redo", () => {
        let {state} = makeState()
        expect(undo({state})).toBe(false)
        expect(redo({state})).toBe(false)
    })

    it("returns false when history extension is missing", () => {
        let {state} = makeState("x", [])
        expect(undo({state})).toBe(false)
        expect(redo({state})).toBe(false)
        expect(undoDepth(state)).toBe(0)
        expect(redoDepth(state)).toBe(0)
    })

    it("blocks undo/redo when the state is read-only", () => {
        // History still records transactions; readOnly only gates the pure commands.
        let {state} = makeState("hi", [history(), EditorState.readOnly.of(true)])
        state = apply(state, {
            changes: {from: 1, to: 1, insert: Slice.of([Leaf.text("X")])},
            userEvent: "input.type",
            annotations: Transaction.time.of(1),
        })
        expect(undoDepth(state)).toBe(1)
        expect(undo({state})).toBe(false)
        expect(redo({state})).toBe(false)
    })
})

describe("event grouping", () => {
    it("joins adjacent input.type edits within newGroupDelay into one undo step", () => {
        let {state} = makeState("a", history({newGroupDelay: 500}))
        state = typeAt(state, 1, "b", {time: 1000})
        state = typeAt(state, 2, "c", {time: 1100})
        expect(undoDepth(state)).toBe(1)
        state = runCommand(state, undo).state
        expect(state.doc.textContent()).toBe("a")
    })

    it("splits edits when the time gap exceeds newGroupDelay", () => {
        let {state} = makeState("a", history({newGroupDelay: 500}))
        state = typeAt(state, 1, "b", {time: 1000})
        state = typeAt(state, 2, "c", {time: 2000})
        expect(undoDepth(state)).toBe(2)
        state = runCommand(state, undo).state
        expect(state.doc.textContent()).toBe("ba")
        state = runCommand(state, undo).state
        expect(state.doc.textContent()).toBe("a")
    })

    it("isolates with history.isolate full so neighbors do not join", () => {
        let {state} = makeState("a", history({newGroupDelay: 500}))
        state = typeAt(state, 1, "b", {time: 1000})
        state = typeAt(state, 2, "c", {
            time: 1050,
            annotations: history.isolate.of("full"),
        })
        expect(undoDepth(state)).toBe(2)
    })
})

describe("addToHistory false and redo clearing", () => {
    it("maps non-history changes so later undo still works", () => {
        let {state} = makeState("hello")
        // Insert "X" at 1 → "Xhello", history event
        state = typeAt(state, 1, "X", {time: 1})
        expect(state.doc.textContent()).toBe("Xhello")
        // Non-history insert "Y" later in the same text block (pos 3 is inside "Xhello")
        state = apply(state, {
            changes: {from: 3, to: 3, insert: Slice.of([Leaf.text("Y")])},
            annotations: [Transaction.addToHistory.of(false), Transaction.time.of(2)],
        })
        expect(state.doc.textContent()).toBe("XhYello")
        expect(undoDepth(state)).toBe(1)
        state = runCommand(state, undo).state
        // Undo only the "X" insert; mapping should leave "Y" in place → "hYello"
        expect(state.doc.textContent()).toBe("hYello")
    })

    it("clears the redo stack when a new edit is made after undo", () => {
        let {state} = makeState("ab")
        state = typeAt(state, 1, "1", {time: 1})
        state = typeAt(state, 2, "2", {time: 10000})
        expect(undoDepth(state)).toBe(2)
        state = runCommand(state, undo).state
        expect(redoDepth(state)).toBe(1)
        state = typeAt(state, 1, "Z", {time: 20000})
        expect(redoDepth(state)).toBe(0)
        expect(state.doc.textContent()).toBe("Z1ab")
    })
})

describe("invertedEffects", () => {
    it("stores and restores custom inverted effects on undo", () => {
        let tag = Transaction.Effect.define<number>()
        let {state} = makeState("a", [
            history(),
            history.invertedEffects.of((tr) => {
                let found = tr.effects.find((e) => e.is(tag))
                return found ? [tag.of(-found.value)] : []
            }),
        ])
        state = apply(state, {
            changes: {from: 1, to: 1, insert: Slice.of([Leaf.text("x")])},
            effects: tag.of(7),
            userEvent: "input.type",
            annotations: Transaction.time.of(1),
        })
        let undoing = undo({state})
        expect(undoing).not.toBe(false)
        if (undoing === false) return
        let effects = undoing.effects
            ? Array.isArray(undoing.effects)
                ? undoing.effects
                : [undoing.effects]
            : []
        expect(effects.length).toBe(1)
        expect(effects[0].is(tag)).toBe(true)
        expect(effects[0].value).toBe(-7)
        state = apply(state, undoing)
        expect(state.doc.textContent()).toBe("a")
    })
})

describe("JSON round-trip", () => {
    it("serializes and restores history stacks", () => {
        let {state, schema} = makeState("hi")
        state = typeAt(state, 1, "X", {time: 1})
        state = typeAt(state, 2, "Y", {time: 10000})
        expect(undoDepth(state)).toBe(2)

        let json = state.toJSON({hist: history.field as EditorState.Field<any>})
        let restored = EditorState.fromJSON(
            json,
            [EditorState.schemaElement.of(schema.elements), history()],
            {hist: history.field as EditorState.Field<any>},
        )
        expect(restored.doc.textContent()).toBe("XYhi")
        expect(undoDepth(restored)).toBe(2)
        restored = runCommand(restored, undo).state
        expect(restored.doc.textContent()).toBe("Xhi")
        restored = runCommand(restored, undo).state
        expect(restored.doc.textContent()).toBe("hi")
    })

    it("rejects invalid history JSON", () => {
        let {schema} = basicSchema()
        expect(() =>
            EditorState.fromJSON(
                {doc: schema.doc([basicSchema().paragraph.create([Leaf.text("x")])]).toJSON(), selection: {type: "text", anchor: 1, head: 1}, hist: null},
                [EditorState.schemaElement.of(schema.elements), history()],
                {hist: history.field as EditorState.Field<any>},
            ),
        ).toThrow()
    })
})

describe("minDepth clip", () => {
    it("clips the stack when depth exceeds minDepth * 1.3", () => {
        let {state} = makeState("x", history({minDepth: 2, newGroupDelay: 0}))
        // newGroupDelay 0 means time-based join never fires (time - prevTime < 0 is false
        // for increasing times). Force separate events via large time gaps.
        let t = 0
        let pos = 1
        for (let i = 0; i < 5; i++) {
            state = typeAt(state, pos, String(i), {time: (t += 1000)})
            pos++
        }
        // After many events, depth should be at most minDepth once clip runs
        // (hysteresis: clips when > 2*1.3 = 2.6, so at depth 3+).
        expect(undoDepth(state)).toBeLessThanOrEqual(2)
    })
})
