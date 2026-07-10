import {describe, expect, it} from "vitest"
import {ChangeSet, Leaf, Plot, Schema, Slice} from "@arrisa/doc"
import {EditorState} from "../state"
import {EditorSelection} from "../selection"
import {Transaction, Effect, Annotation, asArray, mergeTransaction, resolveTransactionInner} from "./index"

function basicSchema() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph])
    return {schema, paragraph}
}

function makeState(text = "hello", extensions: EditorState.Extension = []) {
    let {schema, paragraph} = basicSchema()
    let doc = schema.doc([paragraph.create([Leaf.text(text)])])
    let state = EditorState.create({
        doc,
        selection: EditorSelection.cursor(1),
        config: [EditorState.schemaElement.of(schema.elements), extensions],
    })
    return {state, doc, schema, paragraph}
}

describe("Annotation", () => {
    it("defines types and narrows with is()", () => {
        let custom = Annotation.define<string>()
        let ann = custom.of("x")
        expect(ann.is(custom)).toBe(true)
        expect(ann.is(Transaction.time)).toBe(false)
        expect(ann.value).toBe("x")
    })
})

describe("Transaction annotations and user events", () => {
    it("auto-adds time and resolves userEvent shorthand", () => {
        let {state} = makeState()
        let tr = state.update({userEvent: "input.type"})
        expect(tr.annotation(Transaction.time)).toEqual(expect.any(Number))
        expect(tr.annotation(Transaction.userEvent)).toBe("input.type")
        expect(tr.isUserEvent("input")).toBe(true)
        expect(tr.isUserEvent("input.type")).toBe(true)
        expect(tr.isUserEvent("delete")).toBe(false)
    })

    it("maps selection when document changes", () => {
        let {state} = makeState("ab")
        // cursor at 1; insert before it should push head forward when mapped
        let tr = state.update({
            changes: {from: 1, to: 1, insert: Slice.of([Leaf.text("X")])},
        })
        expect(tr.newDoc.textContent()).toBe("Xab")
        expect(tr.newSelection.from).toBeGreaterThanOrEqual(1)
    })
})

describe("Effect", () => {
    it("maps values and drops when mapper returns undefined", () => {
        let keep = Effect.define<number>({map: (v) => v + 1})
        let drop = Effect.define<number>({map: () => undefined})
        let {doc} = makeState("a")
        let change = ChangeSet.create(doc, {from: 1, to: 1, insert: Slice.of([Leaf.text("x")])})
        let k = keep.of(1)
        let mapped = k.map(change)
        expect(mapped).not.toBe(k)
        expect(mapped!.value).toBe(2)
        expect(drop.of(1).map(change)).toBeUndefined()
        // identity map reuses instance
        let id = Effect.define<number>()
        let e = id.of(5)
        expect(e.map(change)).toBe(e)
        expect(e.is(id)).toBe(true)
    })

    it("mapEffects filters dropped effects", () => {
        let drop = Effect.define<number>({map: () => undefined})
        let keep = Effect.define<number>()
        let {doc} = makeState("a")
        let change = ChangeSet.create(doc, {from: 1, to: 1, insert: Slice.of([Leaf.text("x")])})
        let mapped = Effect.mapEffects([drop.of(1), keep.of(2)], change)
        expect(mapped.length).toBe(1)
        expect(mapped[0].value).toBe(2)
    })
})

describe("resolve / merge", () => {
    it("asArray normalizes values", () => {
        expect(asArray(undefined)).toEqual([])
        expect(asArray(1)).toEqual([1])
        expect(asArray([1, 2])).toEqual([1, 2])
    })

    it("mergeTransaction composes changes", () => {
        let {state, doc} = makeState("hi")
        let a = resolveTransactionInner(state, null, {
            changes: {from: 1, to: 1, insert: Slice.of([Leaf.text("A")])},
        })
        let b = resolveTransactionInner(state, a.changes, {
            sequential: true,
            changes: {from: 2, to: 2, insert: Slice.of([Leaf.text("B")])},
        })
        let merged = mergeTransaction(state, a, b)
        expect(merged.changes.apply(doc).textContent()).toBe("ABhi")
    })

    it("Transaction.merge builds a combined spec", () => {
        let {state} = makeState("hi")
        let spec = Transaction.merge(
            state,
            {changes: {from: 1, to: 1, insert: Slice.of([Leaf.text("A")])}},
            {changes: {from: 2, to: 2, insert: Slice.of([Leaf.text("B")])}, sequential: true},
        )
        let tr = state.update(spec)
        expect(tr.newDoc.textContent()).toBe("ABhi")
    })
})

describe("extender", () => {
    it("folds extender specs into the transaction before apply", () => {
        let {state} = makeState("hi", [
            Transaction.extender.of((tr) => {
                if (!tr.docChanged) return null
                let end = tr.newDoc.length - 1
                return {
                    sequential: true,
                    changes: {from: end, to: end, insert: Slice.of([Leaf.text("!")])},
                }
            }),
        ])
        let tr = state.update({
            changes: {from: 1, to: 1, insert: Slice.of([Leaf.text("X")])},
        })
        expect(tr.newDoc.textContent()).toContain("X")
        expect(tr.newDoc.textContent()).toContain("!")
    })
})

describe("appender", () => {
    it("chains follow-up transactions with the appended annotation", () => {
        let {state} = makeState("hi", [
            Transaction.appender.of((_trs, top) => {
                if (top.doc.textContent().includes("!")) return null
                let end = top.doc.length - 1
                return {
                    changes: {from: end, to: end, insert: Slice.of([Leaf.text("!")])},
                }
            }),
        ])
        let tr = state.update({
            changes: {from: 1, to: 1, insert: Slice.of([Leaf.text("X")])},
        })
        let chain = Transaction.append(tr)
        expect(chain.length).toBe(2)
        expect(chain[1].annotation(Transaction.appended)).toBe(true)
        expect(chain[1].state.doc.textContent()).toContain("!")
    })

    it("returns a single transaction when no appenders fire", () => {
        let {state} = makeState()
        let tr = state.update({selection: {anchor: 2, head: 2}})
        expect(Transaction.append(tr)).toEqual([tr])
    })
})
