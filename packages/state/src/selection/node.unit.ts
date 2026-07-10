import {describe, expect, it} from "vitest"
import {ChangeSet, Leaf, Plot, Schema, Slice, ValidationError} from "@arrisa/doc"
import {EditorSelection} from "./selection"
import {Node} from "./node"
import {Text} from "./text"
import {EditorState} from "../state"

function schemaWithHr() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let hr = Leaf.define("hr", {shape: {element: "hr"}, selectable: true})
    let docType = Plot.defineDoc({blockContent: [paragraph, hr]})
    let schema = Schema.define([docType, paragraph, hr])
    return {schema, paragraph, hr, docType}
}

describe("Node selection", () => {
    let {schema, paragraph, hr} = schemaWithHr()

    function makeDoc() {
        // <p>hi</p><hr>  — Leaf.define returns the default leaf instance
        return schema.doc([paragraph.create([Leaf.text("hi")]), hr])
    }

    it("create spans the leaf length", () => {
        let d = makeDoc()
        // p length 4 (open+hi+close), hr at pos 4
        let node = d.nodeAt(4) as Leaf
        expect(node.type).toBe(hr.type)
        let sel = Node.create(4, node)
        expect(sel.anchor).toBe(4)
        expect(sel.head).toBe(5)
        expect(sel.from).toBe(4)
        expect(sel.to).toBe(5)
        expect(sel.empty).toBe(false)
        expect(sel.isCursor).toBe(false)
    })

    it("eq compares only anchor", () => {
        let d = makeDoc()
        let node = d.nodeAt(4) as Leaf
        let a = Node.create(4, node)
        let b = Node.create(4, node)
        expect(a.eq(b)).toBe(true)
        expect(a.eq(Text.create({anchor: 4, head: 5}))).toBe(false)
    })

    it("map keeps the node when it survives", () => {
        let d = makeDoc()
        let node = d.nodeAt(4) as Leaf
        let sel = Node.create(4, node)
        // insert into first paragraph
        let change = ChangeSet.create(d, {from: 1, to: 1, insert: Slice.of([Leaf.text("X")])})
        let next = change.apply(d)
        let mapped = sel.map(change, {doc: next, config: EditorState.create({doc: next, config: [EditorState.schemaElement.of(schema.elements)]}).config})
        expect(mapped).toBeInstanceOf(Node)
        expect(mapped.anchor).toBe(5)
        expect((mapped as Node).node.type).toBe(hr.type)
    })

    it("map falls back to near when the node is deleted", () => {
        let d = makeDoc()
        let node = d.nodeAt(4) as Leaf
        let sel = Node.create(4, node)
        let change = ChangeSet.create(d, {from: 4, to: 5, insert: Slice.empty})
        let next = change.apply(d)
        let state = EditorState.create({
            doc: next,
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        let mapped = sel.map(change, {doc: next, config: state.config})
        expect(mapped).toBeInstanceOf(Text)
        expect(mapped.isCursor).toBe(true)
    })

    it("JSON round-trip and validation", () => {
        let d = makeDoc()
        let state = EditorState.create({
            doc: d,
            selection: EditorSelection.node(4, d.nodeAt(4) as Leaf),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        let json = state.selection.toJSON(state)
        expect(json).toEqual({type: "node", pos: 4})
        let restored = EditorSelection.fromJSON({doc: d, config: state.config}, json)
        expect(restored).toBeInstanceOf(Node)
        expect(restored.anchor).toBe(4)

        expect(() => Node.type.fromJSON(d, {pos: 1})).toThrow(ValidationError)
        expect(() => Node.type.fromJSON(d, {pos: 99} as any)).toThrow()
    })
})
