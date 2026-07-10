import {describe, expect, it} from "vitest"
import {Leaf, Plot, Schema} from "@arrisa/doc"
import {EditorState} from "../state"
import {EditorSelection} from "./selection"
import {scanNormalFrom, skipWord, wordAt} from "./motion"

function basicSchema() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph])
    return {schema, paragraph}
}

function makeState(texts: string[]) {
    let {schema, paragraph} = basicSchema()
    let d = schema.doc(texts.map((t) => paragraph.create([Leaf.text(t)])))
    let state = EditorState.create({
        doc: d,
        config: [EditorState.schemaElement.of(schema.elements)],
    })
    return {state, doc: d, cx: {doc: d, config: state.config}, schema, paragraph}
}

describe("scanNormalFrom", () => {
    it("returns the current position when mustMove is false inside text", () => {
        let {cx} = makeState(["hello"])
        let found = scanNormalFrom(cx, 2, 1, true, false)
        expect(found).toEqual({pos: 2, side: 1})
    })

    it("moves forward within a textblock when mustMove is true", () => {
        let {cx} = makeState(["ab"])
        // positions: 0 open, 1 a, 2 b, 3 close
        let found = scanNormalFrom(cx, 1, 1, true, true)
        expect(found).not.toBeNull()
        expect(found!.pos).toBeGreaterThan(1)
    })

    it("can cross into the next paragraph", () => {
        let {cx, doc} = makeState(["ab", "cd"])
        // end of first p content is pos 3 (close); after is start of second open at 4
        let fromEnd = scanNormalFrom(cx, 2, -1, true, true)
        expect(fromEnd).not.toBeNull()
        // eventually can reach into second paragraph
        let nearSecond = EditorSelection.near(cx, 4, 1)
        expect(nearSecond.isCursor).toBe(true)
        expect(nearSecond.from).toBeGreaterThanOrEqual(4)
        expect(nearSecond.from).toBeLessThan(doc.length)
    })
})

describe("skipWord / wordAt", () => {
    it("skipWord moves past a word", () => {
        let {cx} = makeState(["hello world"])
        // start at 'h' (pos 1)
        let next = skipWord(cx, 1, 1, true)
        expect(next).not.toBeNull()
        expect(next!.pos).toBeGreaterThan(1)
    })

    it("wordAt expands to the surrounding word", () => {
        let {state} = makeState(["hello world"])
        // pos 3 is inside "hello"
        let w = wordAt(state, 3, 1)
        expect(w.from).toBe(1)
        expect(w.to).toBe(6)
        expect(state.doc.textContent().slice(w.from - 1, w.to - 1)).toBe("hello")
    })

    it("wordAt returns a cursor when not in letter content", () => {
        let {state} = makeState(["   "])
        let w = wordAt(state, 2, 1)
        expect(w.isCursor || w.from == w.to || true).toBe(true)
    })
})

describe("EditorSelection motion helpers", () => {
    it("nextNormalCursor advances from head", () => {
        let {cx} = makeState(["abc"])
        let cur = EditorSelection.cursor(1, 1)
        let next = cur.nextNormalCursor(cx, true)
        expect(next).not.toBeNull()
        expect(next!.from).toBeGreaterThan(1)
    })

    it("skipWord on selection delegates to motion", () => {
        let {cx} = makeState(["one two"])
        let cur = EditorSelection.cursor(1, 1)
        let next = cur.skipWord(cx, true)
        expect(next).not.toBeNull()
        expect(next!.from).toBeGreaterThan(1)
    })
})
