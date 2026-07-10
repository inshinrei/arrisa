import {describe, expect, it} from "vitest"
import {none} from "../util/utils"
import {Attributes} from "./attributes"
import {Elt} from "./elt"

describe("Elt.mk / Elt.create", () => {
    it("mk(name) yields empty attrs and empty children", () => {
        let elt = Elt.mk("p")
        expect(elt.tagName).toBe("p")
        expect(elt.attrs).toBe(Attributes.none)
        expect(elt.children).toBe(none)
        expect(elt.children).toBe(Elt.empty)
    })

    it("mk(name, children) sets children without attrs", () => {
        let elt = Elt.mk("p", ["hi"])
        expect(elt.attrs).toBe(Attributes.none)
        expect(elt.children).toEqual(["hi"])
    })

    it("mk(name, attrs) sets attrs without children", () => {
        let elt = Elt.mk("p", {class: "x"})
        expect(elt.attrs).toEqual(["class", "x"])
        expect(elt.children).toBe(none)
    })

    it("mk(name, attrs, children) sets both", () => {
        let elt = Elt.mk("a", {href: "/x"}, ["go"])
        expect(elt.attrs).toEqual(["href", "/x"])
        expect(elt.children).toEqual(["go"])
    })

    it("canonicalizes a sole hole child to Elt.hole", () => {
        let elt = Elt.mk<string>("div", [0])
        expect(elt.children).toBe(Elt.hole)
        expect(elt.children[0]).toBe(0)
    })

    it("create preserves provided attrs and children", () => {
        let attrs: Attributes = ["id", "n"]
        let children = ["x"] as const
        let elt = Elt.create("span", attrs, children)
        expect(elt.tagName).toBe("span")
        expect(elt.attrs).toBe(attrs)
        expect(elt.children).toBe(children)
    })
})

describe("hasContent / fill", () => {
    it("text-only trees have no content hole", () => {
        expect(Elt.mk("p", ["hello"]).hasContent).toBe(false)
        expect(Elt.mk("p").hasContent).toBe(false)
    })

    it("detects a root hole and fill replaces it", () => {
        let tpl = Elt.mk<string>("p", [0])
        expect(tpl.hasContent).toBe(true)
        let filled = tpl.fill(["a"])
        expect(filled.children).toEqual(["a"])
        expect(filled.hasContent).toBe(false)
    })

    it("fills nested holes only", () => {
        let em = Elt.mk<string>("em", [0])
        let p = Elt.mk("p", [em, " tail"])
        expect(p.hasContent).toBe(true)
        let filled = p.fill(["x"])
        expect(filled.toHTML()).toBe("<p><em>x</em> tail</p>")
    })

    it("leaves non-hole leaves by reference when filling siblings", () => {
        let leaf = Elt.mk("strong", ["keep"])
        let root = Elt.mk<string>("p", [leaf, 0])
        let filled = root.fill(["new"])
        expect(filled.children[0]).toBe(leaf)
        expect(filled.children[1]).toBe("new")
    })

    it("splices multiple fill items into a hole", () => {
        let tpl = Elt.mk<string>("p", ["a", 0, "c"])
        expect(tpl.fill(["b1", "b2"]).children).toEqual(["a", "b1", "b2", "c"])
    })
})

describe("eq / eqTag / eqChildren", () => {
    it("equates identical trees", () => {
        let a = Elt.mk("p", {class: "c"}, ["x"])
        let b = Elt.mk("p", {class: "c"}, ["x"])
        expect(a.eq(b)).toBe(true)
        expect(a.eqTag(b)).toBe(true)
        expect(a.eqChildren(b)).toBe(true)
    })

    it("rejects tag or attr mismatches", () => {
        let base = Elt.mk("p", {class: "c"}, ["x"])
        expect(base.eq(Elt.mk("div", {class: "c"}, ["x"]))).toBe(false)
        expect(base.eq(Elt.mk("p", {class: "d"}, ["x"]))).toBe(false)
        expect(base.eqTag(Elt.mk("p", {class: "d"}))).toBe(false)
    })

    it("compares nested Elt children via eq", () => {
        let a = Elt.mk("p", [Elt.mk("em", ["x"])])
        let b = Elt.mk("p", [Elt.mk("em", ["x"])])
        let c = Elt.mk("p", [Elt.mk("em", ["y"])])
        expect(a.eq(b)).toBe(true)
        expect(a.eq(c)).toBe(false)
    })

    it("treats holes as equal and rejects hole vs text", () => {
        let a = Elt.mk<string>("p", [0])
        let b = Elt.create<string>("p", Attributes.none, [0])
        expect(a.eqChildren(b)).toBe(true)
        expect(a.eq(Elt.mk("p", ["x"]))).toBe(false)
    })

    it("short-circuits on reference-equal children arrays", () => {
        let kids = ["x"] as const
        let a = Elt.create("p", Attributes.none, kids)
        let b = Elt.create("p", Attributes.none, kids)
        expect(a.eqChildren(b)).toBe(true)
    })

    it("rejects length and string mismatches", () => {
        expect(Elt.mk("p", ["a"]).eq(Elt.mk("p", ["a", "b"]))).toBe(false)
        expect(Elt.mk("p", ["a"]).eq(Elt.mk("p", ["b"]))).toBe(false)
    })

    it("rejects non-Elt values", () => {
        expect(Elt.mk("p").eq(null)).toBe(false)
        expect(Elt.mk("p").eq({tagName: "p"})).toBe(false)
    })
})

describe("wrap / addAttrs", () => {
    it("wrap without target wraps the whole tree", () => {
        let inner = Elt.mk("em", ["x"])
        let wrapped = inner.wrap(Elt.mk("p", [0]))
        expect(wrapped.toHTML()).toBe("<p><em>x</em></p>")
    })

    it("wrap with target wraps the matching descendant", () => {
        let tree = Elt.mk("div", [Elt.mk("em", {class: "t"}, ["x"])])
        let wrapped = tree.wrap(Elt.mk("strong", [0]), Elt.Selector.parse("em.t"))
        expect(wrapped.toHTML()).toBe('<div><strong><em class="t">x</em></strong></div>')
    })

    it("wrap falls back to root when target misses", () => {
        let inner = Elt.mk("em", ["x"])
        let wrapped = inner.wrap(Elt.mk("p", [0]), Elt.Selector.parse("span"))
        expect(wrapped.toHTML()).toBe("<p><em>x</em></p>")
    })

    it("addAttrs merges onto the root", () => {
        let elt = Elt.mk("p", {class: "a"}).addAttrs(Attributes.read({class: "b", id: "n"}))
        expect(elt.attrs).toEqual(["class", "a b", "id", "n"])
    })

    it("addAttrs with target merges onto the match", () => {
        let tree = Elt.mk("div", [Elt.mk("span", {class: "t"}, ["x"])])
        let next = tree.addAttrs(Attributes.read({class: "extra"}), Elt.Selector.parse("span.t"))
        expect(next.toHTML()).toBe('<div><span class="t extra">x</span></div>')
        expect(tree.toHTML()).toBe('<div><span class="t">x</span></div>')
    })

    it("addAttrs falls back to root when target misses", () => {
        let elt = Elt.mk("p", {class: "a"}).addAttrs(Attributes.read({id: "n"}), Elt.Selector.parse("span"))
        expect(elt.attrs).toEqual(["class", "a", "id", "n"])
    })
})
