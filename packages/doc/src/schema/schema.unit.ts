import {describe, expect, it} from "vitest"
import {SchemaError, ValidationError} from "../util/error"
import {Mark} from "../model/mark"
import {Leaf, Plot, Node} from "../model/node"
import {Schema} from "./schema"

function basicSchema() {
    let paragraph = Plot.define("paragraph", {
        inlineContent: true,
        shape: {element: "p"},
    })
    let bold = Mark.define("bold", {shape: {element: "strong"}})
    let em = Mark.define("em", {shape: {element: "em"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph, bold, em])
    return {paragraph, bold, em, docType, schema}
}

describe("Schema.define", () => {
    it("requires a document type", () => {
        let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
        expect(() => Schema.define([paragraph])).toThrow(SchemaError)
        expect(() => Schema.define([paragraph])).toThrow(/document type/)
    })

    it("rejects duplicate node names", () => {
        let p1 = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
        let p2 = Plot.define("paragraph", {inlineContent: true, shape: {element: "div"}})
        let docType = Plot.defineDoc({blockContent: p1})
        expect(() => Schema.define([docType, p1, p2])).toThrow(/Duplicate use of tag name/)
    })

    it("rejects duplicate mark names", () => {
        let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
        let bold1 = Mark.define("bold", {shape: {element: "strong"}})
        let bold2 = Mark.define("bold", {shape: {element: "b"}})
        let docType = Plot.defineDoc({blockContent: paragraph})
        expect(() => Schema.define([docType, paragraph, bold1, bold2])).toThrow(/Duplicate use of mark name/)
    })

    it("skips duplicate element instances and caches by element list", () => {
        let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
        let docType = Plot.defineDoc({blockContent: paragraph})
        let spec = [docType, docType, paragraph] as const
        let a = Schema.define(spec)
        let b = Schema.define(spec)
        expect(a).toBe(b)
        expect(a.getNode("paragraph")).toBe(paragraph.type)
    })

    it("rejects inline/block content mismatches", () => {
        // block leaf cannot be child of an inline-content plot
        let blockLeaf = Leaf.define("hr", {shape: {element: "hr"}})
        let badPara = Plot.define("bad_p", {
            inlineContent: blockLeaf as any,
            shape: {element: "p"},
        })
        let docType = Plot.defineDoc({blockContent: badPara})
        expect(() => Schema.define([docType, badPara, blockLeaf])).toThrow(/inline content|block content/)
    })

    it("rejects multiple line break tags", () => {
        let br1 = Leaf.define("br1", {
            inline: true,
            role: Node.Role.LineBreak,
            shape: {element: "br"},
        })
        let br2 = Leaf.define("br2", {
            inline: true,
            role: Node.Role.LineBreak,
            shape: {element: "br"},
        })
        let paragraph = Plot.define("paragraph", {
            inlineContent: true,
            shape: {element: "p"},
        })
        let docType = Plot.defineDoc({blockContent: paragraph})
        expect(() => Schema.define([docType, paragraph, br1, br2])).toThrow(/Multiple line break/)
    })

    it("rejects block line breaks and line breaks without default", () => {
        let blockBr = Leaf.define("block_br", {
            role: Node.Role.LineBreak,
            shape: {element: "br"},
        })
        let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
        let docType = Plot.defineDoc({blockContent: paragraph})
        expect(() => Schema.define([docType, paragraph, blockBr])).toThrow(/Line break tags must be inline/)
    })

    it("accepts a single inline line break with default", () => {
        let br = Leaf.define("br", {
            inline: true,
            role: Node.Role.LineBreak,
            shape: {element: "br"},
        })
        let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
        let docType = Plot.defineDoc({blockContent: paragraph})
        let schema = Schema.define([docType, paragraph, br])
        expect(schema.lineBreak).toBe(br)
    })
})

describe("Schema content and queries", () => {
    let {paragraph, bold, schema, docType} = basicSchema()

    it("canContain allows text in paragraphs and forbids doc as child", () => {
        expect(schema.canContain(paragraph.type, Leaf.Text)).toBe(true)
        expect(schema.canContain(docType, paragraph.type)).toBe(true)
        expect(schema.canContain(paragraph.type, docType)).toBe(false)
        expect(schema.canContain(docType, docType)).toBe(false)
    })

    it("matchNode handles groups, types, AND, and OR queries", () => {
        expect(schema.matchNode(Leaf.Text, Node.Group.Inline)).toBe(true)
        expect(schema.matchNode(Leaf.Text, Node.Group.Block)).toBe(false)
        expect(schema.matchNode(paragraph.type, paragraph.type)).toBe(true)
        expect(schema.matchNode(paragraph.type, paragraph)).toBe(true)
        expect(schema.matchNode(Leaf.Text, {and: [Node.Group.Inline, Node.Group.Leaf]})).toBe(true)
        expect(schema.matchNode(Leaf.Text, {and: [Node.Group.Inline, Node.Group.Block]})).toBe(false)
        expect(schema.matchNode(paragraph.type, [Node.Group.Leaf, paragraph.type])).toBe(true)
    })

    it("markAllowed defaults to inline leaves", () => {
        expect(schema.markAllowed(bold.type, Leaf.Text)).toBe(true)
        expect(schema.markAllowed(bold.type, paragraph.type)).toBe(false)
    })

    it("sharesContent when two plots accept a common child", () => {
        expect(schema.sharesContent(docType, docType)).toBe(true)
        expect(schema.sharesContent(paragraph.type, paragraph.type)).toBe(true)
    })

    it("has / getNode / getMark look up by identity", () => {
        expect(schema.has(paragraph.type)).toBe(true)
        expect(schema.has(paragraph)).toBe(true)
        expect(schema.has(bold)).toBe(true)
        expect(schema.has(bold.type)).toBe(true)
        expect(schema.getNode("paragraph")).toBe(paragraph.type)
        expect(schema.getMark("bold")).toBe(bold.type)
        expect(schema.getNode("missing")).toBeUndefined()
        expect(schema.getMark("missing")).toBeUndefined()
        let other = Mark.define("other", {shape: {element: "u"}})
        expect(schema.has(other)).toBe(false)
    })
})

describe("Schema.Override", () => {
    it("markTarget overrides which nodes a mark may target", () => {
        let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
        let bold = Mark.define("bold", {shape: {element: "strong"}})
        let docType = Plot.defineDoc({blockContent: paragraph})
        let schema = Schema.define([
            docType,
            paragraph,
            bold,
            Schema.Override.markTarget(bold, paragraph.type),
        ])
        expect(schema.markAllowed(bold.type, paragraph.type)).toBe(true)
        expect(schema.markAllowed(bold.type, Leaf.Text)).toBe(false)
    })

    it("plotContent overrides allowed children", () => {
        let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
        let heading = Plot.define("heading", {inlineContent: true, shape: {element: "h1"}})
        let docType = Plot.defineDoc({blockContent: paragraph})
        let schema = Schema.define([
            docType,
            paragraph,
            heading,
            Schema.Override.plotContent(docType, [paragraph.type, heading.type]),
        ])
        expect(schema.canContain(docType, heading.type)).toBe(true)
    })

    it("nodeGroup adds custom groups", () => {
        let custom = Node.Group.define()
        let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
        let docType = Plot.defineDoc({blockContent: paragraph})
        let schema = Schema.define([docType, paragraph, Schema.Override.nodeGroup(paragraph, custom)])
        expect(schema.matchNode(paragraph.type, custom)).toBe(true)
    })

    it("eq compares override fields", () => {
        let bold = Mark.define("bold", {shape: {element: "strong"}})
        let a = Schema.Override.markTarget(bold, Node.Group.Inline)
        let b = Schema.Override.markTarget(bold, Node.Group.Inline)
        expect(a.eq(a)).toBe(true)
        // different function instances for the same static target wrapper
        expect(a.eq(b)).toBe(false)
    })
})

describe("Schema.validate", () => {
    let {paragraph, bold, schema} = basicSchema()

    it("accepts a well-formed document", () => {
        let doc = schema.doc([paragraph.create([Leaf.text("hi", [bold])])])
        expect(() => schema.validate(doc)).not.toThrow()
        // memoized
        expect(() => schema.validate(doc)).not.toThrow()
    })

    it("rejects marks not in the schema", () => {
        let other = Mark.define("other", {shape: {element: "u"}})
        let text = Leaf.text("x", [other])
        expect(() => schema.validate(text)).toThrow(ValidationError)
        expect(() => schema.validate(text)).toThrow(/not in schema/)
    })

    it("rejects marks on disallowed node types", () => {
        let marked = paragraph.withMarks([bold])
        let node = marked.create([Leaf.text("x")])
        expect(() => schema.validate(node)).toThrow(/cannot target/)
    })

    it("rejects illegal children", () => {
        // paragraph as child of paragraph is illegal for this schema
        let inner = paragraph.create([Leaf.text("x")])
        let outer = paragraph.create([inner as any])
        expect(() => schema.validate(outer)).toThrow(/cannot contain/)
    })
})

describe("Schema.withMarksFrom", () => {
    it("copies marks when keepOnTypeChange is true and mark is allowed", () => {
        let keep = Mark.define("keep", {
            shape: {element: "u"},
            keepOnTypeChange: true,
        })
        let drop = Mark.define("drop", {
            shape: {element: "s"},
            keepOnTypeChange: false,
        })
        let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
        let docType = Plot.defineDoc({blockContent: paragraph})
        let schema = Schema.define([docType, paragraph, keep, drop])
        let from = Leaf.text("x", keep.addToSet([drop]))
        let to = Leaf.text("y")
        let next = schema.withMarksFrom(from, to)
        expect(keep.isInSet(next.marks)).toBeTruthy()
        expect(drop.isInSet(next.marks)).toBeNull()
    })
})

describe("Schema.findWrapping / defaults", () => {
    it("returns empty path when parent can contain child directly", () => {
        let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
        let docType = Plot.defineDoc({blockContent: paragraph})
        let schema = Schema.define([docType, paragraph])
        expect(schema.findWrapping(docType, paragraph.type)).toEqual([])
        expect(schema.findWrapping(paragraph.type, Leaf.Text)).toEqual([])
    })

    it("finds a wrapper path through intermediate plots", () => {
        let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
        let bq = Plot.define("blockquote", {
            blockContent: paragraph,
            shape: {element: "blockquote"},
        })
        let docType = Plot.defineDoc({blockContent: bq})
        let schema = Schema.define([docType, bq, paragraph])
        let path = schema.findWrapping(docType, paragraph.type)
        expect(path).not.toBeNull()
        expect(path!.map((t) => t.name)).toEqual(["blockquote"])
        // cached
        expect(schema.findWrapping(docType, paragraph.type)).toBe(path)
    })

    it("returns null when no wrapping exists", () => {
        let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
        let docType = Plot.defineDoc({blockContent: paragraph})
        let schema = Schema.define([docType, paragraph])
        // doc cannot wrap as a child of paragraph
        expect(schema.findWrapping(paragraph.type, docType)).toBeNull()
    })

    it("createDefault and createAndFill build default content", () => {
        let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
        let docType = Plot.defineDoc({blockContent: paragraph})
        let schema = Schema.define([docType, paragraph])
        expect(schema.defaultContentTag(docType)).toBe(paragraph)
        let filled = schema.createAndFill(paragraph)
        expect(filled.isPlot).toBe(true)
        expect((filled as Plot).content).toEqual([])
        let child = schema.createDefault(docType)
        expect(child.name).toBe("paragraph")
    })
})

describe("Schema JSON", () => {
    let {paragraph, bold, schema} = basicSchema()

    it("round-trips a document with marks", () => {
        let doc = schema.doc([paragraph.create([Leaf.text("hi", [bold])])])
        let json = doc.toJSON()
        let restored = schema.docFromJSON(json)
        expect(restored.eq(doc)).toBe(true)
        let para = restored.content[0] as Plot
        let text = para.content[0]
        expect(text.marks[0].name).toBe("bold")
    })

    it("marksFromJSON sorts into a set", () => {
        let marks = schema.marksFromJSON({bold: null, em: null})
        expect(marks.length).toBe(2)
        expect(schema.getMark("bold")!.isInSet(marks)).toBeTruthy()
        expect(schema.getMark("em")!.isInSet(marks)).toBeTruthy()
    })

    it("rejects invalid JSON", () => {
        expect(() => schema.docFromJSON({type: "nope"} as any)).toThrow(ValidationError)
        expect(() => schema.nodeFromJSON({type: "missing"} as any)).toThrow(/Invalid tag JSON/)
        expect(() => schema.marksFromJSON({unknown: null})).toThrow(/Unrecognized mark/)
        expect(() => schema.marksFromJSON(null as any)).toThrow(/Invalid mark JSON/)
        expect(() => schema.docFromJSON(null as any)).toThrow(/Invalid document JSON/)
    })
})
