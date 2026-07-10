import {describe, expect, it} from "vitest"
import {Schema} from "../schema/schema"
import {Mark} from "../model/mark"
import {Leaf, Plot, Node} from "../model/node"
import {Slice} from "../model/slice"
import {Elt} from "../shape/elt"
import {serialize} from "./serialize"

function basicSchema() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let bold = Mark.define("strong", {shape: {element: "strong"}})
    let em = Mark.define("em", {shape: {element: "em"}})
    let br = Leaf.define("br", {
        inline: true,
        role: Node.Role.LineBreak,
        shape: {element: "br"},
    })
    let pre = Plot.define("pre", {
        inlineContent: true,
        preserveWhitespace: true,
        shape: {element: "pre"},
    })
    let docType = Plot.defineDoc({blockContent: [paragraph, pre]})
    let schema = Schema.define([docType, paragraph, pre, bold, em, br])
    return {schema, paragraph, pre, bold, em, br}
}

describe("serialize", () => {
    let {schema, paragraph, bold, em} = basicSchema()

    it("serializes a simple paragraph document", () => {
        let doc = schema.doc([paragraph.create([Leaf.text("hi")])])
        expect(serialize(doc).toHTML()).toBe("<p>hi</p>")
    })

    it("wraps marked text in mark elements", () => {
        let doc = schema.doc([paragraph.create([Leaf.text("hi", [bold])])])
        expect(serialize(doc).toHTML()).toBe("<p><strong>hi</strong></p>")
    })

    it("nests spanning marks in rank order", () => {
        let doc = schema.doc([paragraph.create([Leaf.text("x", [bold, em])])])
        let html = serialize(doc).toHTML()
        // both wrappers present around the text
        expect(html).toMatch(/<p>.*x.*<\/p>/)
        expect(html).toContain("strong")
        expect(html).toContain("em")
        expect(html).toContain("x")
    })

    it("serializes a single node", () => {
        let p = paragraph.create([Leaf.text("a")])
        let out = serialize.node(p, {})
        expect(typeof out == "string" ? out : out.toHTML()).toBe("<p>a</p>")
    })

    it("supports override for node tags", () => {
        let doc = schema.doc([paragraph.create([Leaf.text("x")])])
        let frag = serialize(doc, {
            override: () => Elt.mk("div", {class: "wrap"}, [0]),
        })
        expect(frag.toHTML()).toBe(`<div class="wrap">x</div>`)
    })
})

describe("serialize.slice", () => {
    let {paragraph, bold} = basicSchema()

    it("serializes a closed node slice", () => {
        let slice = Slice.of([paragraph.create([Leaf.text("hi")])])
        expect(serialize.slice(slice, {}).toHTML()).toBe("<p>hi</p>")
    })

    it("serializes open slices using context tags", () => {
        // open-start fragment: close of paragraph after partial text
        let slice = Slice.of([Leaf.text("hi"), Plot.End])
        let html = serialize
            .slice(slice, {
                context: [paragraph],
                includeContext: 0,
            })
            .toHTML()
        expect(html).toBe("<p>hi</p>")
    })

    it("marks open sides when openAttr is set", () => {
        let slice = Slice.of([paragraph, Leaf.text("x")])
        let html = serialize
            .slice(slice, {
                openAttr: "data-open",
            })
            .toHTML()
        expect(html).toContain("data-open")
        expect(html).toContain("x")
    })

    it("keeps marks on slice content", () => {
        let slice = Slice.of([Leaf.text("b", [bold])])
        expect(serialize.slice(slice, {}).toHTML()).toBe("<strong>b</strong>")
    })
})

describe("serialize emitNewlines", () => {
    let {schema, pre, br} = basicSchema()

    it("turns line breaks into newlines in preserveWhitespace nodes by default", () => {
        let doc = schema.doc([pre.create([Leaf.text("a"), br, Leaf.text("b")])])
        let html = serialize(doc).toHTML()
        expect(html).toContain("a\nb")
    })

    it("keeps line-break elements when emitNewlines is false", () => {
        let doc = schema.doc([pre.create([Leaf.text("a"), br, Leaf.text("b")])])
        let html = serialize(doc, {emitNewlines: false}).toHTML()
        expect(html).toContain("<br>")
        expect(html).not.toContain("a\nb")
    })
})
