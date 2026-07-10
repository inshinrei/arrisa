import {describe, expect, it} from "vitest"
import {Elt} from "./elt"
import {createOuterDOM, getDoc, parseTagName, toHTML} from "./render"

describe("toHTML", () => {
    it("escapes text content", () => {
        expect(Elt.mk("p", ["a < b & c"]).toHTML()).toBe("<p>a &lt; b &amp; c</p>")
    })

    it("escapes attribute values", () => {
        expect(Elt.mk("a", {title: 'say "hi" & go'}).toHTML()).toBe(
            `<a title="say &quot;hi&quot; &amp; go"></a>`,
        )
        expect(Elt.mk("a", {title: "a < b > c"}).toHTML()).toBe(`<a title="a &lt; b &gt; c"></a>`)
    })

    it("skips unsafe attribute names in serialization", () => {
        let bag = ["class", "ok", "onclick", "alert(1)", "href", "https://x"] as const
        let elt = Elt.create("a", bag, [])
        let html = elt.toHTML()
        expect(html).toBe(`<a class="ok" href="https://x"></a>`)
        expect(html).not.toMatch(/onclick/i)
    })

    it("skips unsafe attribute names when creating DOM", () => {
        let set: string[] = []
        let fake = {
            createElement() {
                return {
                    setAttribute(name: string, value: string) {
                        set.push(name, value)
                    },
                }
            },
        } as unknown as Document
        let bag = ["class", "ok", "onerror", "x", "data-x", "1"] as const
        createOuterDOM(Elt.create("div", bag, []), fake)
        expect(set).toEqual(["class", "ok", "data-x", "1"])
    })

    it("serializes HTML void elements without a closing tag", () => {
        expect(Elt.mk("br").toHTML()).toBe("<br>")
        expect(Elt.mk("img", {src: "x"}).toHTML()).toBe(`<img src="x">`)
    })

    it("serializes normal elements with close tags", () => {
        expect(Elt.mk("p", ["x"]).toHTML()).toBe("<p>x</p>")
    })

    it("emits a single namespaced open tag for svg:svg (no double open)", () => {
        let html = Elt.mk("svg:svg", {viewBox: "0 0 1 1"}).toHTML()
        expect(html).toBe(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>`)
        expect(html.match(/<svg/g)?.length).toBe(1)
    })

    it("serializes nested svg elements without xmlns on non-roots", () => {
        let html = Elt.mk("svg:svg", [Elt.mk("svg:circle", {r: "1"})]).toHTML()
        expect(html).toBe(`<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>`)
    })

    it("emits MathML xmlns on math:math", () => {
        expect(Elt.mk("math:math").toHTML()).toBe(`<math xmlns="http://www.w3.org/1998/Math/MathML"/>`)
    })

    it("ignores content holes in HTML output", () => {
        expect(Elt.mk("p", ["a", 0, "b"]).toHTML()).toBe("<p>ab</p>")
    })

    it("serializes Fragment as concatenated roots", () => {
        let frag = Elt.Fragment.create([Elt.mk("p", ["a"]), " ", Elt.mk("p", ["b"])])
        expect(frag.toHTML()).toBe("<p>a</p> <p>b</p>")
    })

    it("toHTML free function matches instance method", () => {
        let elt = Elt.mk("p", {class: "c"}, ["x"])
        expect(toHTML(elt)).toBe(elt.toHTML())
    })
})

describe("parseTagName", () => {
    it("strips namespace prefixes", () => {
        expect(parseTagName("div")).toEqual({localName: "div", svg: false, math: false})
        expect(parseTagName("svg:circle")).toEqual({localName: "circle", svg: true, math: false})
        expect(parseTagName("math:mi")).toEqual({localName: "mi", svg: false, math: true})
    })
})

describe("getDoc", () => {
    it("throws when no document is available", () => {
        let had = (globalThis as any).document
        try {
            delete (globalThis as any).document
            expect(() => getDoc()).toThrow(/No document available/)
            expect(() => getDoc(undefined)).toThrow(/No document available/)
        } finally {
            if (had !== undefined) (globalThis as any).document = had
        }
    })

    it("returns an explicit document argument", () => {
        let fake = {createElement() {}} as unknown as Document
        expect(getDoc(fake)).toBe(fake)
    })
})
