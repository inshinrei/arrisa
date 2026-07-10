import {describe, expect, it} from "vitest"
import {ChangeSet, Leaf, Plot, Schema, Slice} from "@arrisa/doc"
import {EditorState} from "@arrisa/state"
import {ScrollTarget, ViewState, scrollIntoView} from "./view-state"
import {UpdateFlag} from "./flags"

function basic() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph])
    let doc = schema.doc([paragraph.create([Leaf.text("hello")])])
    let state = EditorState.create({
        doc,
        config: [EditorState.schemaElement.of(schema.elements)],
    })
    return {schema, paragraph, doc, state}
}

const spec = {x: "nearest" as const, y: "nearest" as const, xMargin: 5, yMargin: 5}

describe("UpdateFlag", () => {
    it("uses distinct bit values", () => {
        expect(UpdateFlag.Focus).toBe(1)
        expect(UpdateFlag.Geometry).toBe(2)
        expect(UpdateFlag.Focus | UpdateFlag.Geometry).toBe(3)
    })
})

describe("ScrollTarget", () => {
    it("map is identity for empty changes", () => {
        let {doc} = basic()
        let target = new ScrollTarget(2, 4, -1, spec)
        let empty = ChangeSet.empty(doc.length)
        expect(target.map(empty)).toBe(target)
    })

    it("maps a point with association", () => {
        let {doc} = basic()
        let change = ChangeSet.create(doc, {from: 1, to: 1, insert: Slice.of([Leaf.text("X")])})
        let target = new ScrollTarget(3, 3, -1, spec)
        let mapped = target.map(change)
        expect(mapped.from).toBe(change.mapPos(3, -1))
        expect(mapped.to).toBe(mapped.from)
    })

    it("maps a range and keeps to >= from", () => {
        let {doc} = basic()
        // delete 2..5
        let change = ChangeSet.create(doc, {from: 2, to: 5, insert: Slice.empty})
        let target = new ScrollTarget(1, 6, 1, spec)
        let mapped = target.map(change)
        expect(mapped.from).toBeLessThanOrEqual(mapped.to)
    })

    it("clip leaves in-range targets alone", () => {
        let {state} = basic()
        let target = new ScrollTarget(1, 3, -1, spec)
        expect(target.clip(state)).toBe(target)
    })

    it("clip clamps past doc.length", () => {
        let {state} = basic()
        let len = state.doc.length
        let target = new ScrollTarget(len + 5, len + 10, -1, spec)
        let clipped = target.clip(state)
        expect(clipped.from).toBe(len)
        expect(clipped.to).toBe(len)
    })
})

describe("ViewState", () => {
    it("accumulates pending transactions and flush clears them", () => {
        let {state} = basic()
        let vs = new ViewState(state)
        let tr = state.update({})
        vs.update(tr)
        expect(vs.pending.length).toBe(1)
        expect(vs.state).toBe(tr.state)
        vs.flush()
        expect(vs.pending.length).toBe(0)
        expect(vs.flushedState).toBe(tr.state)
    })

    it("sets scrollTarget from tr.scrollIntoView to the new selection head", () => {
        let {state} = basic()
        let vs = new ViewState(state)
        let tr = state.update({
            selection: {anchor: 2, head: 2},
            scrollIntoView: true,
        })
        vs.update(tr)
        expect(vs.scrollTarget).not.toBe(null)
        expect(vs.scrollTarget!.from).toBe(2)
        expect(vs.scrollTarget!.to).toBe(2)
    })

    it("clips scrollIntoView effects against the transaction's new state", () => {
        let {state, doc} = basic()
        let vs = new ViewState(state)
        // shrink doc so a large scroll target must clip
        let tr = state.update({
            changes: {from: 1, to: doc.length - 1, insert: Slice.empty},
            effects: scrollIntoView.of(new ScrollTarget(100, 100, -1, spec)),
        })
        vs.update(tr)
        expect(vs.scrollTarget!.from).toBe(tr.state.doc.length)
        expect(vs.scrollTarget!.to).toBe(tr.state.doc.length)
    })

    it("mapPosPending maps through all pending transactions", () => {
        let {state} = basic()
        let vs = new ViewState(state)
        let tr1 = state.update({
            changes: {from: 1, to: 1, insert: Slice.of([Leaf.text("A")])},
        })
        vs.update(tr1)
        let tr2 = tr1.state.update({
            changes: {from: 1, to: 1, insert: Slice.of([Leaf.text("B")])},
        })
        vs.update(tr2)
        // original pos 1 → after two inserts at 1
        expect(vs.mapPosPending(1, -1)).toBe(tr2.changes.mapPos(tr1.changes.mapPos(1, -1), -1))
    })

    it("throws when transaction startState does not match", () => {
        let {state} = basic()
        let vs = new ViewState(state)
        let tr = state.update({})
        vs.update(tr)
        let stale = state.update({})
        expect(() => vs.update(stale)).toThrow(/Mismatched/)
    })
})
