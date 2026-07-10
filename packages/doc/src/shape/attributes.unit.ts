import {describe, expect, it} from "vitest"
import {none} from "../util/utils"
import {Attributes} from "./attributes"

describe("Attributes.none", () => {
    it("is the shared empty singleton", () => {
        expect(Attributes.none.length).toBe(0)
        expect(Attributes.none).toBe(none)
        expect(Attributes.none).toBe(Attributes.none)
    })
})

describe("Attributes.eq", () => {
    it("returns true for the same reference", () => {
        let a: Attributes = ["href", "/x"]
        expect(Attributes.eq(a, a)).toBe(true)
        expect(Attributes.eq(Attributes.none, Attributes.none)).toBe(true)
    })

    it("compares pair content", () => {
        expect(Attributes.eq(["a", "1", "b", "2"], ["a", "1", "b", "2"])).toBe(true)
        expect(Attributes.eq(["a", "1"], ["a", "2"])).toBe(false)
        expect(Attributes.eq(["a", "1"], ["a", "1", "b", "2"])).toBe(false)
        expect(Attributes.eq(Attributes.none, ["a", "1"])).toBe(false)
        expect(Attributes.eq(["a", "1"], Attributes.none)).toBe(false)
    })
})

describe("Attributes.compare", () => {
    it("returns 0 for equal attributes", () => {
        expect(Attributes.compare(Attributes.none, Attributes.none)).toBe(0)
        expect(Attributes.compare(["a", "1"], ["a", "1"])).toBe(0)
        expect(Attributes.compare(["a", "1", "b", "2"], ["a", "1", "b", "2"])).toBe(0)
    })

    it("penalizes value mismatches", () => {
        expect(Attributes.compare(["a", "1"], ["a", "2"])).toBe(-1)
    })

    it("penalizes keys only in a", () => {
        expect(Attributes.compare(["a", "1"], Attributes.none)).toBe(-1)
        expect(Attributes.compare(["a", "1", "c", "3"], ["a", "1"])).toBe(-1)
    })

    it("penalizes keys only in b (symmetric with a-only)", () => {
        expect(Attributes.compare(Attributes.none, ["a", "1"])).toBe(-1)
        expect(Attributes.compare(["href", "x"], ["class", "c", "href", "x"])).toBe(-1)
    })

    it("counts distinct keys on both sides", () => {
        expect(Attributes.compare(["a", "1"], ["b", "1"])).toBe(-2)
        expect(Attributes.compare(["a", "1", "c", "3"], ["b", "2"])).toBe(-3)
    })

    it("scores more differences lower", () => {
        let equal = Attributes.compare(["a", "1"], ["a", "1"])
        let oneDiff = Attributes.compare(["a", "1"], ["a", "2"])
        let twoDiff = Attributes.compare(["a", "1"], ["b", "1"])
        expect(equal).toBeGreaterThan(oneDiff)
        expect(oneDiff).toBeGreaterThan(twoDiff)
    })
})

describe("Attributes.merge", () => {
    it("returns the other side when one is empty", () => {
        let a: Attributes = ["href", "/x"]
        expect(Attributes.merge(Attributes.none, a)).toBe(a)
        expect(Attributes.merge(a, Attributes.none)).toBe(a)
        expect(Attributes.merge(Attributes.none, Attributes.none)).toBe(Attributes.none)
    })

    it("merges non-overlapping keys in sorted order", () => {
        expect(Attributes.merge(["a", "1"], ["b", "2"])).toEqual(["a", "1", "b", "2"])
        expect(Attributes.merge(["b", "2"], ["a", "1"])).toEqual(["a", "1", "b", "2"])
    })

    it("prefers b for overlapping non-special keys", () => {
        expect(Attributes.merge(["href", "/old"], ["href", "/new"])).toEqual(["href", "/new"])
        expect(Attributes.merge(["a", "1", "href", "/old"], ["href", "/new"])).toEqual(["a", "1", "href", "/new"])
    })

    it("space-joins class values", () => {
        expect(Attributes.merge(["class", "foo"], ["class", "bar"])).toEqual(["class", "foo bar"])
    })

    it("semicolon-joins style values", () => {
        expect(Attributes.merge(["style", "color: red"], ["style", "font-weight: bold"])).toEqual([
            "style",
            "color: red;font-weight: bold",
        ])
    })

    it("merges mixed special and regular keys", () => {
        expect(
            Attributes.merge(["class", "a", "href", "/x", "style", "color: red"], ["class", "b", "id", "n", "style", "display: none"]),
        ).toEqual(["class", "a b", "href", "/x", "id", "n", "style", "color: red;display: none"])
    })
})

describe("Attributes.push", () => {
    it("inserts pairs in sorted key order", () => {
        let a: string[] = []
        Attributes.push(a, "href", "/x")
        Attributes.push(a, "class", "c")
        Attributes.push(a, "id", "n")
        expect(a).toEqual(["class", "c", "href", "/x", "id", "n"])
    })

    it("overwrites an existing non-special key", () => {
        let a: string[] = ["href", "/old"]
        Attributes.push(a, "href", "/new")
        expect(a).toEqual(["href", "/new"])
    })

    it("appends class and style values", () => {
        let a: string[] = ["class", "foo", "style", "color: red"]
        Attributes.push(a, "class", "bar")
        Attributes.push(a, "style", "display: none")
        expect(a).toEqual(["class", "foo bar", "style", "color: red;display: none"])
    })

    it("inserts a key in the middle without disturbing neighbors", () => {
        let a: string[] = ["a", "1", "c", "3"]
        Attributes.push(a, "b", "2")
        expect(a).toEqual(["a", "1", "b", "2", "c", "3"])
    })
})

describe("Attributes.read", () => {
    it("returns Attributes.none for empty or null-only objects", () => {
        expect(Attributes.read({})).toBe(Attributes.none)
        expect(Attributes.read({href: null, class: null})).toBe(Attributes.none)
    })

    it("skips the reserved _ key and null values", () => {
        expect(Attributes.read({_: "content", href: "/x", title: null})).toEqual(["href", "/x"])
    })

    it("sorts keys regardless of input order", () => {
        expect(Attributes.read({href: "/x", class: "c", id: "n"})).toEqual(["class", "c", "href", "/x", "id", "n"])
    })

    it("folds style/* properties into a style attribute", () => {
        expect(Attributes.read({"style/color": "red", href: "/x"})).toEqual(["href", "/x", "style", "color: red"])
        expect(Attributes.read({"style/color": "red", "style/display": "none"})).toEqual([
            "style",
            "color: red;display: none",
        ])
    })
})

describe("Attributes.get", () => {
    it("returns the value for a present key", () => {
        expect(Attributes.get(["class", "c", "href", "/x"], "href")).toBe("/x")
        expect(Attributes.get(["class", "c", "href", "/x"], "class")).toBe("c")
    })

    it("returns null when the key is missing or attrs are empty", () => {
        expect(Attributes.get(["href", "/x"], "id")).toBe(null)
        expect(Attributes.get(Attributes.none, "href")).toBe(null)
    })
})
