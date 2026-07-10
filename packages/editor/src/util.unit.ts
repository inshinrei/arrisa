import {describe, expect, it, vi, afterEach} from "vitest"
import {Leaf, Plot, Schema} from "@arrisa/doc"
import {EditorState} from "@arrisa/state"
import {eqArray, exceptionSink, logException} from "./util"

class Eq {
    constructor(readonly n: number) {}
    eq(other: Eq) {
        return this.n == other.n
    }
}

function makeState(extensions: EditorState.Extension = []) {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph])
    let doc = schema.doc([paragraph.create([Leaf.text("x")])])
    return EditorState.create({
        doc,
        config: [EditorState.schemaElement.of(schema.elements), extensions],
    })
}

describe("eqArray", () => {
    it("treats nullish values with == (null equals undefined)", () => {
        expect(eqArray(null, null)).toBe(true)
        expect(eqArray(undefined, undefined)).toBe(true)
        expect(eqArray(null, undefined)).toBe(true)
        expect(eqArray([], null)).toBe(false)
        expect(eqArray(null, [])).toBe(false)
    })

    it("returns true for identical references", () => {
        let a = [new Eq(1)]
        expect(eqArray(a, a)).toBe(true)
    })

    it("compares length and element .eq", () => {
        expect(eqArray([new Eq(1), new Eq(2)], [new Eq(1), new Eq(2)])).toBe(true)
        expect(eqArray([new Eq(1)], [new Eq(1), new Eq(2)])).toBe(false)
        expect(eqArray([new Eq(1)], [new Eq(9)])).toBe(false)
    })
})

describe("logException", () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it("calls the exceptionSink facet handler when present", () => {
        let seen: unknown[] = []
        let state = makeState(exceptionSink.of((e) => seen.push(e)))
        let err = new Error("boom")
        logException(state, err, "ctx")
        expect(seen).toEqual([err])
    })

    it("falls back to console.error without a sink", () => {
        let spy = vi.spyOn(console, "error").mockImplementation(() => {})
        let state = makeState()
        logException(state, "x", "where")
        expect(spy).toHaveBeenCalled()
        expect(String(spy.mock.calls[0][0])).toContain("where")
    })
})
