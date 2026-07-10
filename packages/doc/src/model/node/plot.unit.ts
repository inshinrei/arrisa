import {describe, expect, it} from "vitest"
import {SchemaError} from "../../util/error"
import {Schema} from "../../schema/schema"
import {Mark} from "../mark"
import {Slice} from "../slice"
import {Token} from "../token"
import {Leaf} from "./leaf"
import {Plot} from "./plot"
import {Doc} from "./doc"
import {NodeFlag} from "./flags"

function basicSchema() {
    let paragraph = Plot.define("paragraph", {
        inlineContent: true,
        shape: {element: "p"},
    })
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph])
    return {paragraph, docType, schema}
}

describe("Plot.Tag / Plot.create", () => {
    let para = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let bold = Mark.define("bold", {shape: {element: "strong"}})

    it("creates plots with joined text content", () => {
        let p = para.create([Leaf.text("hel"), Leaf.text("lo")])
        expect(p.isPlot).toBe(true)
        expect(p.isLeaf).toBe(false)
        expect(p.isText).toBe(false)
        expect(p.isTextblock).toBe(true)
        expect(p.name).toBe("paragraph")
        expect(p.content.length).toBe(1)
        expect((p.content[0] as Leaf<string>).param).toBe("hello")
        expect(p.contentLength).toBe(5)
        expect(p.length).toBe(7) // open + 5 + close
        expect(p.tokenType).toBe(Token.Type.Node)
        expect(p.tag.tokenType).toBe(Token.Type.Open)
    })

    it("uses empty content when none is provided", () => {
        let p = para.create()
        expect(p.content).toEqual([])
        expect(p.length).toBe(2)
        expect(p.firstChild).toBeNull()
        expect(p.lastChild).toBeNull()
    })

    it("reports first and last children", () => {
        let a = Leaf.text("a")
        let b = Leaf.text("b", [bold])
        let p = para.create([a, b])
        expect(p.firstChild).toBe(p.content[0])
        expect(p.lastChild).toBe(p.content[1])
    })

    it("eq compares tag and content", () => {
        let p1 = para.create([Leaf.text("x")])
        let p2 = para.create([Leaf.text("x")])
        let p3 = para.create([Leaf.text("y")])
        expect(p1.eq(p1)).toBe(true)
        expect(p1.eq(p2)).toBe(true)
        expect(p1.eq(p3)).toBe(false)
        expect(p1.eq(Leaf.text("x"))).toBe(false)
    })

    it("withMarks rebuilds via the tag when marks change", () => {
        let p = para.create([Leaf.text("x")])
        expect(p.withMarks(Mark.none)).toBe(p)
        let marked = p.withMarks([bold])
        expect(marked).not.toBe(p)
        expect(marked.marks).toEqual([bold])
        expect((marked.content[0] as Leaf<string>).param).toBe("x")
    })

    it("tag.create rejects Doc tags", () => {
        let docTag = Plot.defineDoc({blockContent: para}).default!
        expect(() => docTag.create([])).toThrow(/schema\.doc/)
    })
})

describe("Plot.sliceInner / slicePlot", () => {
    let para = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})

    it("returns empty for a zero-width range", () => {
        let p = para.create([Leaf.text("ab")])
        expect(p.sliceInner(1, 1)).toBe(Slice.empty)
    })

    it("returns the whole node when fully covered from open", () => {
        let p = para.create([Leaf.text("ab")])
        let s = p.sliceInner(0, p.length)
        expect(s.content.length).toBe(1)
        expect(s.content[0]).toBe(p)
    })

    it("emits open + partial content without close", () => {
        let p = para.create([Leaf.text("ab")])
        // length 4: open, a, b, close — slice 0..2 → tag + "a"
        let out: any[] = []
        p.slicePlot(out, 0, 2)
        expect(out[0]).toBe(para)
        expect(out[1].is(Leaf.Text) && out[1].param).toBe("a")
        expect(out.includes(Plot.End)).toBe(false)
    })

    it("emits close without open for a right-open range", () => {
        let p = para.create([Leaf.text("ab")])
        // slice 2..4: content from 1..3 → "b" + End
        let out: any[] = []
        p.slicePlot(out, 2, 4)
        expect(out[0].is(Leaf.Text) && out[0].param).toBe("b")
        expect(out[1]).toBe(Plot.End)
    })
})

describe("Plot.iterate / nodeAt", () => {
    let para = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let {schema, paragraph} = basicSchema()

    it("walks all nodes including the plot root", () => {
        let p = para.create([Leaf.text("ab")])
        let seen: string[] = []
        p.iterate((node) => {
            seen.push(node.isText ? `text:${node.param}` : node.name)
        })
        expect(seen).toEqual(["paragraph", "text:ab"])
    })

    it("stops descending when the callback returns false", () => {
        let p = para.create([Leaf.text("ab")])
        let seen: string[] = []
        p.iterate((node) => {
            seen.push(node.name)
            return false
        })
        expect(seen).toEqual(["paragraph"])
    })

    it("supports a positional range", () => {
        let p = para.create([Leaf.text("abcd")])
        let texts: string[] = []
        // content occupies positions 1..5; range covering "bc"
        p.iterate(2, 4, (node) => {
            if (node.isText) texts.push(node.param as string)
        })
        // callback receives whole child text node when it overlaps range
        expect(texts).toEqual(["abcd"])
    })

    it("skips calling the callback on Doc itself", () => {
        let doc = schema.doc([paragraph.create([Leaf.text("x")])])
        let names: string[] = []
        doc.iterate((node) => {
            names.push(node.name)
        })
        expect(names[0]).not.toBe("Doc")
        expect(names).toContain("paragraph")
        expect(names).toContain("Text")
    })

    it("nodeAt / plotAt resolve plot children and ignore text interiors", () => {
        let p = para.create([Leaf.text("ab")])
        // at content start (pos 0 relative to plot content walk): first child is text → null
        expect(p.nodeAt(0)).toBeNull()
        // inside text
        expect(p.nodeAt(1)).toBeNull()
        // past end
        expect(p.nodeAt(5)).toBeNull()

        let outer = Plot.define("blockquote", {
            blockContent: para,
            canBeEmpty: true,
            shape: {element: "blockquote"},
        })
        let child = para.create([Leaf.text("x")])
        let bq = outer.create([child])
        // pos 0 → first child plot
        expect(bq.nodeAt(0)).toBe(child)
        expect(bq.plotAt(0)).toBe(child)
        // inside child content (pos 1 is open of child... wait:
        // bq content: [child], child length = 2+1 = 3
        // pos 0 → child (plot)
        // pos 1 → inside child at pos 0 relative → child.nodeAt(0) → text at 0 → null
        expect(bq.nodeAt(1)).toBeNull()
    })
})

describe("Plot.textContent", () => {
    let {schema, paragraph} = basicSchema()

    it("joins text across textblocks with a separator", () => {
        let doc = schema.doc([
            paragraph.create([Leaf.text("one")]),
            paragraph.create([Leaf.text("two")]),
        ])
        expect(doc.textContent()).toBe("one\ntwo")
        expect(doc.textContent({blockSeparator: " | "})).toBe("one | two")
    })

    it("supports leafText for non-text leaves", () => {
        let br = Leaf.define("br", {inline: true, shape: {element: "br"}})
        let p = paragraph.create([Leaf.text("a"), br, Leaf.text("b")])
        expect(p.textContent({leafText: "↵"})).toBe("a↵b")
    })
})

describe("Plot.Tag.split", () => {
    it("keeps marks whose keepOnSplit is true", () => {
        let keep = Mark.define("keep", {
            shape: {element: "u"},
            keepOnSplit: true,
        })
        let drop = Mark.define("drop", {
            shape: {element: "s"},
            keepOnSplit: false,
        })
        let para = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
        let tag = para.withMarks(keep.addToSet([drop]))
        let split = tag.split(false)
        expect(split.marks.length).toBe(1)
        expect(split.marks[0].type).toBe(keep.type)
    })

    it("returns the same tag when there are no marks", () => {
        let para = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
        expect(para.split(true)).toBe(para)
    })
})

describe("Plot.Type / defineDoc", () => {
    it("requires inline or block content", () => {
        expect(() => Plot.Type.define("bad", {shape: {element: "div"}} as any)).toThrow(SchemaError)
    })

    it("rejects both inline and block content via flagsFor", () => {
        expect(() =>
            Plot.Type.define("bad2", {
                inlineContent: true,
                blockContent: true as any,
                shape: {element: "div"},
            }),
        ).toThrow(SchemaError)
    })

    it("rejects inline non-atom plots with block content", () => {
        expect(() =>
            Plot.Type.define("bad3", {
                inline: true,
                blockContent: true as any,
                shape: {element: "span", atom: false},
            }),
        ).toThrow(/atoms/)
    })

    it("sets defining / neutral / orientation defaults", () => {
        let p = Plot.Type.define("p", {inlineContent: true, shape: {element: "p"}})
        expect(p.inlineContent).toBe(true)
        expect(p.isTextblock).toBe(true)
        expect(p.isDoc).toBe(false)
        expect(p.canBeEmpty).toBe(true)
        expect(p.orientation).toBe("row")
        expect(p.defining).toBe(false)
        expect(p.neutral).toBe(true)

        let div = Plot.Type.define("div", {
            blockContent: true as any,
            defining: true,
            shape: {element: "div"},
        })
        expect(div.orientation).toBe("column")
        expect(div.defining).toBe(true)
        expect(div.neutral).toBe(false)
        expect(div.canBeEmpty).toBe(false)
    })

    it("defineDoc requires content and sets Doc flags", () => {
        expect(() => Plot.defineDoc({} as any)).toThrow(/Doc nodes must allow content/)
        let p = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
        let doc = Plot.defineDoc({blockContent: p})
        expect(doc.isDoc).toBe(true)
        expect(doc.flags & NodeFlag.Doc).toBe(NodeFlag.Doc)
        expect(doc.flags & NodeFlag.NullParam).toBe(NodeFlag.NullParam)
        expect(doc.default).not.toBeNull()
        expect(doc.name).toBe("Doc")
    })

    it("of reuses the default tag", () => {
        let p = Plot.Type.define("p2", {
            inlineContent: true,
            defaultParam: null as any,
            shape: {element: "p"},
        })
        // without NullParam, defaultParam: null still creates default via "defaultParam" in spec
        expect(p.of(null as any)).toBe(p.default)
    })
})

describe("Plot.Doc", () => {
    let {schema, paragraph} = basicSchema()

    it("uses content-only length", () => {
        let doc = schema.doc([paragraph.create([Leaf.text("hi")])])
        // paragraph length 4 (open+h+i+close); doc length = content only
        expect(doc.length).toBe(4)
        expect(doc.contentLength).toBe(4)
        expect(doc.isDoc).toBe(true)
        expect(doc.schema).toBe(schema)
    })

    it("is the same constructor as Doc re-export", () => {
        expect(Doc).toBe(Plot.Doc)
        let doc = schema.doc([paragraph.create([Leaf.text("x")])])
        expect(doc).toBeInstanceOf(Plot.Doc)
        expect(doc).toBeInstanceOf(Doc)
    })

    it("slice delegates to sliceInner without outer open/close", () => {
        let doc = schema.doc([
            paragraph.create([Leaf.text("ab")]),
            paragraph.create([Leaf.text("cd")]),
        ])
        // first para length 4; slice 0..4 is first paragraph whole
        let s = doc.slice(0, 4)
        expect(s.content.length).toBe(1)
        expect((s.content[0] as Plot).name).toBe("paragraph")
    })

    it("noValidate restores the previous flag after success and failure", () => {
        let threw = false
        try {
            Plot.Doc.noValidate(() => {
                // construct without going through schema validation path used by schema.doc
                Plot.Doc.new(schema, [Leaf.text("orphan")])
                throw new Error("boom")
            })
        } catch (e: any) {
            threw = e.message == "boom"
        }
        expect(threw).toBe(true)
        // validation should be active again
        expect(() => schema.doc([Leaf.text("nope")])).toThrow()
    })

    it("toJSON includes nested content", () => {
        let doc = schema.doc([paragraph.create([Leaf.text("x")])])
        expect(doc.toJSON()).toEqual({
            type: "Doc",
            content: [{type: "paragraph", content: [{type: "Text", param: "x"}]}],
        })
    })

    it("toString shows structure", () => {
        let p = paragraph.create([Leaf.text("hi")])
        expect(p.toString()).toBe('paragraph("hi")')
    })
})
