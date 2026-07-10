import {describe, expect, it} from "vitest"
import {none} from "../util/utils"
import {Attributes} from "./attributes"
import {Elt} from "./elt"
import {NoChildren, NodeShape} from "./shape"

describe("NoChildren", () => {
    it("is the shared empty children singleton", () => {
        expect(NoChildren).toBe(none)
        expect(NoChildren).toBe(Elt.empty)
        expect(NoChildren.length).toBe(0)
    })
})

describe("NodeShape.from — Element", () => {
    it("defaults leaf nodes to atom with empty children", () => {
        let shape = NodeShape.from("br", true, {element: "br"})
        expect(shape.atom).toBe(true)
        let elt = shape.create(undefined)
        expect(elt.tagName).toBe("br")
        expect(elt.attrs).toBe(Attributes.none)
        expect(elt.children).toBe(Elt.empty)
    })

    it("defaults non-leaf nodes to non-atom with a content hole", () => {
        let shape = NodeShape.from("p", false, {element: "p"})
        expect(shape.atom).toBe(false)
        let elt = shape.create(undefined)
        expect(elt.tagName).toBe("p")
        expect(elt.children).toBe(Elt.hole)
    })

    it("uses static attributes and shares the same Elt across create calls", () => {
        let shape = NodeShape.from("a", false, {
            element: "a",
            attributes: {href: "/x", class: "link"},
        })
        let a = shape.create(undefined)
        let b = shape.create(undefined)
        expect(a).toBe(b)
        expect(a.attrs).toEqual(["class", "link", "href", "/x"])
        expect(a.children).toBe(Elt.hole)
    })

    it("rebuilds dynamic attributes from the param", () => {
        let shape = NodeShape.from<{href: string}>("a", false, {
            element: "a",
            attributes: (param) => ({href: param.href}),
        })
        let a = shape.create({href: "/one"})
        let b = shape.create({href: "/two"})
        expect(a).not.toBe(b)
        expect(a.attrs).toEqual(["href", "/one"])
        expect(b.attrs).toEqual(["href", "/two"])
        expect(a.children).toBe(Elt.hole)
    })

    it("omits attributes when none are provided", () => {
        let shape = NodeShape.from("span", true, {element: "span"})
        expect(shape.create(undefined).attrs).toBe(Attributes.none)
    })

    it("honors explicit atom: true on a non-leaf element", () => {
        let shape = NodeShape.from("div", false, {element: "div", atom: true})
        expect(shape.atom).toBe(true)
        expect(shape.create(undefined).children).toBe(Elt.empty)
    })

    it("throws when a leaf element is non-atomic", () => {
        expect(() => NodeShape.from("img", true, {element: "img", atom: false})).toThrow(
            /Leaf tag img's shape must be atomic/,
        )
    })
})

describe("NodeShape.from — Structure", () => {
    it("infers atom true for a static filled template", () => {
        let tpl = Elt.mk("strong", ["x"])
        let shape = NodeShape.from("strong", false, {structure: tpl})
        expect(shape.atom).toBe(true)
        expect(shape.create(undefined)).toBe(tpl)
    })

    it("infers atom false for a static template with a content hole", () => {
        let tpl = Elt.mk<string>("p", [0])
        let shape = NodeShape.from("p", false, {structure: tpl})
        expect(shape.atom).toBe(false)
        expect(shape.create(undefined)).toBe(tpl)
        expect(shape.create(undefined).hasContent).toBe(true)
    })

    it("accepts explicit atom that agrees with hasContent", () => {
        let filled = Elt.mk("em", ["ok"])
        let withHole = Elt.mk<string>("span", [0])
        expect(NodeShape.from("em", false, {structure: filled, atom: true}).atom).toBe(true)
        expect(NodeShape.from("span", false, {structure: withHole, atom: false}).atom).toBe(false)
    })

    it("throws when explicit atom disagrees with structure content", () => {
        let withHole = Elt.mk<string>("p", [0])
        expect(() => NodeShape.from("p", false, {structure: withHole, atom: true})).toThrow(
            /Disagreement between `atom` field and structure for tag p/,
        )
        let filled = Elt.mk("p", ["text"])
        expect(() => NodeShape.from("p", false, {structure: filled, atom: false})).toThrow(
            /Disagreement between `atom` field and structure for tag p/,
        )
    })

    it("throws when a leaf structure has a content hole", () => {
        let withHole = Elt.mk<string>("code", [0])
        expect(() => NodeShape.from("code", true, {structure: withHole})).toThrow(
            /Disagreement between `atom` field and structure for tag code/,
        )
    })

    it("throws when a dynamic non-leaf structure omits atom", () => {
        expect(() =>
            NodeShape.from("div", false, {
                structure: () => Elt.mk("div"),
            }),
        ).toThrow(/Dynamic structure for tag div must define an `atom` field/)
    })

    it("builds dynamic structure with an explicit atom", () => {
        let shape = NodeShape.from<string>("span", false, {
            structure: (text) => Elt.mk("span", {class: "x"}, [text]),
            atom: true,
        })
        expect(shape.atom).toBe(true)
        let elt = shape.create("hi")
        expect(elt.toHTML()).toBe('<span class="x">hi</span>')
    })

    it("builds dynamic non-atom structure with a hole", () => {
        let shape = NodeShape.from("blockquote", false, {
            structure: () => Elt.mk<string>("blockquote", [0]),
            atom: false,
        })
        expect(shape.atom).toBe(false)
        expect(shape.create(undefined).children).toBe(Elt.hole)
    })

    it("forces atom for leaf dynamic structure without requiring atom in the spec", () => {
        let shape = NodeShape.from<string>("hr", true, {
            structure: () => Elt.mk("hr"),
        })
        expect(shape.atom).toBe(true)
        expect(shape.create("unused").tagName).toBe("hr")
    })
})
