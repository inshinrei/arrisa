import {describe, expect, it} from "vitest"
import {Mark} from "../mark"
import {Slice} from "../slice"
import {Token} from "../token"
import {Node} from "./types"
import {Leaf} from "./leaf"
import {NodeFlag} from "./flags"

describe("Leaf.Text", () => {
    it("is an inline leaf type with no default instance", () => {
        expect(Leaf.Text.name).toBe("Text")
        expect(Leaf.Text.isLeaf).toBe(true)
        expect(Leaf.Text.isPlot).toBe(false)
        expect(Leaf.Text.isInline).toBe(true)
        expect(Leaf.Text.isBlock).toBe(false)
        expect(Leaf.Text.default).toBeNull()
    })

    it("creates text nodes via Leaf.text", () => {
        let t = Leaf.text("hi")
        expect(t.is(Leaf.Text)).toBe(true)
        expect(t.param).toBe("hi")
        expect(t.length).toBe(2)
        expect(t.isText).toBe(true)
        expect(t.isLeaf).toBe(true)
        expect(t.isPlot).toBe(false)
        expect(t.tokenType).toBe(Token.Type.Node)
        expect(t.tag).toBe(t)
    })

    it("treats empty text as length 0", () => {
        expect(Leaf.text("").length).toBe(0)
    })
})

describe("Leaf atoms", () => {
    let br = Leaf.define("br", {inline: true, shape: {element: "br"}})
    let img = Leaf.Type.define<{src: string}>("image", {
        inline: true,
        selectable: true,
        defaultParam: {src: ""},
        shape: {element: "img"},
    })

    it("gives non-text leaves length 1", () => {
        expect(br.length).toBe(1)
        expect(br.isText).toBe(false)
        expect(br.param).toBeNull()
    })

    it("sets isSelectable from the spec", () => {
        expect(img.isSelectable).toBe(true)
        expect(br.type.isSelectable).toBe(false)
    })

    it("reuses the default instance when param matches and marks are empty", () => {
        expect(img.of({src: ""})).toBe(img.default)
        expect(img.of({src: "x"})).not.toBe(img.default)
        expect(img.of({src: ""}, [Mark.define("em", {shape: {element: "em"}})])).not.toBe(img.default)
    })

    it("marks atom leaves from shape defaults", () => {
        expect(br.type.isAtom).toBe(true)
        expect(br.type.flags & NodeFlag.Atom).toBe(NodeFlag.Atom)
    })
})

describe("Leaf.eq / withMarks", () => {
    let bold = Mark.define("bold", {shape: {element: "strong"}})

    it("equates by type, param, and marks", () => {
        let a = Leaf.text("x")
        expect(a.eq(a)).toBe(true)
        expect(a.eq(Leaf.text("x"))).toBe(true)
        expect(a.eq(Leaf.text("y"))).toBe(false)
        expect(a.eq(Leaf.text("x", [bold]))).toBe(false)
    })

    it("withMarks returns the same instance when the set is unchanged", () => {
        let a = Leaf.text("x", [bold])
        expect(a.withMarks([bold])).toBe(a)
        expect(a.withMarks(Mark.none).marks).toEqual(Mark.none)
    })
})

describe("Leaf.pushTo", () => {
    let bold = Mark.define("bold", {shape: {element: "strong"}})

    it("merges adjacent same-mark text", () => {
        let nodes: Leaf[] = []
        Leaf.text("hel").pushTo(nodes)
        Leaf.text("lo").pushTo(nodes)
        expect(nodes.length).toBe(1)
        expect(nodes[0].param).toBe("hello")
    })

    it("does not merge text with different marks", () => {
        let nodes: Leaf[] = []
        Leaf.text("a").pushTo(nodes)
        Leaf.text("b", [bold]).pushTo(nodes)
        expect(nodes.length).toBe(2)
    })

    it("appends non-text leaves as-is", () => {
        let br = Leaf.define("br2", {inline: true, shape: {element: "br"}})
        let nodes: Leaf[] = []
        br.pushTo(nodes)
        br.pushTo(nodes)
        expect(nodes).toEqual([br, br])
    })
})

describe("Leaf.sliceText / sliceInner", () => {
    let br = Leaf.define("br3", {inline: true, shape: {element: "br"}})

    it("returns the same node for a full text slice", () => {
        let t = Leaf.text("abcd")
        expect(t.sliceText(0)).toBe(t)
        expect(t.sliceText(0, 4)).toBe(t)
    })

    it("slices a text range and clamps negative bounds", () => {
        let t = Leaf.text("abcd")
        expect(t.sliceText(1, 3).param).toBe("bc")
        expect(t.sliceText(-2, 2).param).toBe("ab")
    })

    it("throws when called on a non-text leaf", () => {
        expect(() => br.sliceText(0, 1)).toThrow(/sliceText/)
    })

    it("sliceInner returns empty for a zero-width range", () => {
        expect(Leaf.text("ab").sliceInner(1, 1)).toBe(Slice.empty)
    })

    it("sliceInner wraps a partial text leaf", () => {
        let s = Leaf.text("hello").sliceInner(1, 4)
        expect(s.content.length).toBe(1)
        expect((s.content[0] as Leaf<string>).param).toBe("ell")
    })

    it("sliceInner keeps non-text leaves whole", () => {
        let s = br.sliceInner(0, 1)
        expect(s.content[0]).toBe(br)
    })
})

describe("Leaf.toString / toJSON", () => {
    let bold = Mark.define("bold", {shape: {element: "strong"}})
    let hr = Leaf.define("hr", {shape: {element: "hr"}})

    it("stringifies text with JSON and optional marks", () => {
        expect(Leaf.text("hi").toString()).toBe('"hi"')
        expect(Leaf.text("hi", [bold]).toString()).toBe('"hi"[bold]')
        expect(hr.toString()).toBe("hr")
    })

    it("omits default params in JSON and includes marks when present", () => {
        expect(hr.toJSON()).toEqual({type: "hr"})
        // withMarks yields a non-default instance, so null param is serialized
        let marked = hr.withMarks([bold])
        expect(marked.toJSON()).toEqual({type: "hr", param: null, marks: {bold: null}})
        expect(Leaf.text("x").toJSON()).toEqual({type: "Text", param: "x"})
    })
})

describe("BaseTag / BaseType via Leaf", () => {
    let codeLeaf = Leaf.define("code_leaf", {
        inline: true,
        role: Node.Role.Code,
        shape: {element: "code"},
    })
    let bold = Mark.define("bold", {shape: {element: "strong"}})

    it("exposes name, roles, and mark lookup", () => {
        expect(codeLeaf.name).toBe("code_leaf")
        expect(codeLeaf.type.hasRole(Node.Role.Code)).toBe(true)
        expect(codeLeaf.type.isInline).toBe(true)
        expect(codeLeaf.mark(bold.type)).toBeUndefined()
        // flag mark value is null when present
        expect(codeLeaf.withMarks([bold]).mark(bold.type)).toBeNull()
    })

    it("is() narrows by type identity", () => {
        expect(codeLeaf.is(codeLeaf.type)).toBe(true)
        expect(codeLeaf.is(Leaf.Text)).toBe(false)
        expect(Leaf.text("a").is(Leaf.Text)).toBe(true)
    })
})
