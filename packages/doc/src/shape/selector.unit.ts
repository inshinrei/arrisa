import {describe, expect, it} from "vitest"
import {Elt} from "./elt"
import {Selector} from "./selector"

describe("Selector.parse", () => {
    it("parses tag, classes, and combinations", () => {
        expect(Selector.parse("div").tag).toBe("div")
        expect(Selector.parse("div").classes).toEqual([])
        expect(Selector.parse(".foo").tag).toBe(null)
        expect(Selector.parse(".foo").classes).toEqual(["foo"])
        expect(Selector.parse("span.bar.baz").tag).toBe("span")
        expect(Selector.parse("span.bar.baz").classes).toEqual(["bar", "baz"])
    })

    it("throws on invalid selector residue", () => {
        expect(() => Selector.parse("div#id")).toThrow(/Invalid element selector/)
        expect(() => Selector.parse("div[href]")).toThrow(/Invalid element selector/)
    })
})

describe("Selector.eq", () => {
    it("compares tag and class lists", () => {
        let a = Selector.parse("span.a.b")
        expect(a.eq(Selector.parse("span.a.b"))).toBe(true)
        expect(a.eq(Selector.parse("span.b.a"))).toBe(false)
        expect(a.eq(Selector.parse("div.a.b"))).toBe(false)
    })
})

describe("Selector.match", () => {
    it("checks tag and class membership", () => {
        let elt = Elt.mk("span", {class: "foo bar"})
        expect(Selector.parse("span").match(elt)).toBe(true)
        expect(Selector.parse("div").match(elt)).toBe(false)
        expect(Selector.parse(".foo").match(elt)).toBe(true)
        expect(Selector.parse(".foo.bar").match(elt)).toBe(true)
        expect(Selector.parse(".baz").match(elt)).toBe(false)
        expect(Selector.parse("span.foo").match(elt)).toBe(true)
        expect(Selector.parse(".foo").match(Elt.mk("span"))).toBe(false)
    })
})

describe("Elt.Selector re-export", () => {
    it("is the same constructor as Selector", () => {
        expect(Elt.Selector).toBe(Selector)
        expect(Elt.Selector.parse("em.t").match(Elt.mk("em", {class: "t"}))).toBe(true)
    })
})
