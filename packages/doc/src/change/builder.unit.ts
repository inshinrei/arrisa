import {describe, expect, it} from "vitest"
import {Schema} from "../schema/schema"
import {Mark} from "../model/mark"
import {Leaf, Plot} from "../model/node"
import {Builder} from "./builder"

function basicSchema() {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let bold = Mark.define("strong", {shape: {element: "strong"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph, bold])
    return {schema, paragraph, bold}
}

describe("Builder", () => {
    let {schema, paragraph, bold} = basicSchema()

    function emptyDoc() {
        return schema.doc([paragraph.create([Leaf.text("x")])])
    }

    it("rebuilds a simple open/node/close tree", () => {
        let builder = new Builder(emptyDoc())
        builder.open(paragraph)
        builder.node(Leaf.text("hi"))
        builder.close()
        let doc = builder.finish()
        expect(doc.content.length).toBe(1)
        expect((doc.content[0] as Plot).content[0]).toMatchObject({param: "hi"})
    })

    it("applies modifications to leaf nodes", () => {
        let builder = new Builder(emptyDoc())
        builder.open(paragraph)
        builder.modifications = [{add: bold}]
        builder.node(Leaf.text("hi"))
        builder.modifications = null
        builder.close()
        let doc = builder.finish()
        let text = (doc.content[0] as Plot).content[0] as Leaf<string>
        expect(text.marks.some((m) => m.eq(bold))).toBe(true)
    })

    it("applies modifications to open tags", () => {
        let builder = new Builder(emptyDoc())
        builder.modifications = [{add: bold}]
        builder.open(paragraph)
        // assert on the stack tag (schema may reject plot-targeted marks at finish)
        expect(builder.stack.tag.marks.some((m) => m.eq(bold))).toBe(true)
    })

    it("rejects modifications on whole plot nodes", () => {
        let builder = new Builder(emptyDoc())
        builder.modifications = [{add: bold}]
        expect(() => builder.node(paragraph.create([Leaf.text("x")]))).toThrow(/non-leaf/)
    })

    it("rejects modifications on close tokens", () => {
        let builder = new Builder(emptyDoc())
        builder.open(paragraph)
        builder.node(Leaf.text("x"))
        builder.modifications = [{add: bold}]
        expect(() => builder.close()).toThrow(/close token/)
    })

    it("rejects surplus close and unfinished stacks", () => {
        let builder = new Builder(emptyDoc())
        expect(() => builder.close()).toThrow(/Surplus close/)
        builder = new Builder(emptyDoc())
        builder.open(paragraph)
        expect(() => builder.finish()).toThrow(/Invalid change/)
    })
})
