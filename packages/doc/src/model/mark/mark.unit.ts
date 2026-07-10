import {describe, expect, it} from "vitest"
import {Mark} from "./mark"

describe("Mark.define / Type.define", () => {
    it("defines a flag mark with a default null instance", () => {
        let bold = Mark.define("bold", {shape: {element: "strong"}})
        expect(bold.value).toBe(null)
        expect(bold.name).toBe("bold")
        expect(bold.type.default).toBe(bold)
        expect(bold.type.isElement).toBe(true)
    })

    it("defines a valued mark via Type.define and of()", () => {
        // value: 0 maps the param to the attribute; cannot combine with defaultParam
        let link = Mark.Type.define<string>("link", {
            shape: {attribute: "href", value: 0},
        })
        expect(link.default).toBeNull()
        let m = link.of("https://x.com")
        expect(m.value).toBe("https://x.com")
        expect(m.type).toBe(link)
        expect(m.name).toBe("link")
    })

    it("supports defaultParam with a non-zero attribute shape", () => {
        let title = Mark.Type.define<string>("title", {
            shape: {attribute: "title", value: (v) => v},
            defaultParam: "",
        })
        expect(title.default!.value).toBe("")
        expect(title.of("tip").value).toBe("tip")
    })

    it("clamps rank to 0..100", () => {
        let low = Mark.Type.define("low", {rank: -5, shape: {element: "u"}})
        let high = Mark.Type.define("high", {rank: 999, shape: {element: "u"}})
        let mid = Mark.Type.define("mid", {rank: 50, shape: {element: "u"}})
        expect(low.rank).toBe(0)
        expect(high.rank).toBe(100)
        expect(mid.rank).toBe(50)
    })

    it("defaults spanning true for element marks and false for attribute marks", () => {
        let el = Mark.Type.define("el", {shape: {element: "em"}})
        let attr = Mark.Type.define<string>("attr", {shape: {attribute: "title", value: 0}})
        let attrSpan = Mark.Type.define<string>("attrSpan", {
            shape: {attribute: "title", value: 0},
            spanning: true,
        })
        expect(el.spanning).toBe(true)
        expect(attr.spanning).toBe(false)
        expect(attrSpan.spanning).toBe(true)
    })

    it("defaults inclusive to true unless explicitly false", () => {
        let a = Mark.Type.define("a", {shape: {element: "em"}})
        let b = Mark.Type.define("b", {shape: {element: "em"}, inclusive: false})
        expect(a.inclusive).toBe(true)
        expect(b.inclusive).toBe(false)
    })
})

describe("Mark.eq / sameSet / toString", () => {
    let bold = Mark.define("bold", {shape: {element: "strong"}})
    let link = Mark.Type.define<string>("link", {shape: {attribute: "href", value: 0}})

    it("eq compares type and deep value", () => {
        expect(bold.eq(bold)).toBe(true)
        expect(link.of("a").eq(link.of("a"))).toBe(true)
        expect(link.of("a").eq(link.of("b"))).toBe(false)
        expect(bold.eq(link.of("x") as any)).toBe(false)
    })

    it("sameSet uses element-wise eq", () => {
        let a = link.of("/a").addToSet([bold])
        let b = link.of("/a").addToSet([bold])
        let c = link.of("/b").addToSet([bold])
        expect(Mark.sameSet(a, b)).toBe(true)
        expect(Mark.sameSet(a, c)).toBe(false)
        expect(Mark.sameSet(Mark.none, Mark.none)).toBe(true)
    })

    it("toString prints name only for null value and JSON for valued marks", () => {
        expect(bold.toString()).toBe("bold")
        expect(link.of("https://x.com").toString()).toBe('link="https://x.com"')
    })
})

describe("Mark.compareRank / addToSet ordering", () => {
    it("orders by rank then name", () => {
        let a = Mark.Type.define("a", {rank: 10, shape: {element: "a"}})
        let b = Mark.Type.define("b", {rank: 20, shape: {element: "b"}})
        let c = Mark.Type.define("c", {rank: 10, shape: {element: "c"}})
        expect(a.compareRank(b)).toBeLessThan(0)
        expect(b.compareRank(a)).toBeGreaterThan(0)
        // same rank: alphabetical by name (a before c)
        expect(a.compareRank(c)).toBeLessThan(0)
        expect(c.compareRank(a)).toBeGreaterThan(0)
    })

    it("inserts marks sorted by rank", () => {
        let low = Mark.define("low", {rank: 1, shape: {element: "u"}})
        let high = Mark.define("high", {rank: 50, shape: {element: "s"}})
        let mid = Mark.define("mid", {rank: 25, shape: {element: "em"}})
        let set = mid.addToSet(high.addToSet([low]))
        expect(set.map((m) => m.name)).toEqual(["low", "mid", "high"])
    })
})

describe("Mark.addToSet", () => {
    let bold = Mark.define("bold", {shape: {element: "strong"}})
    let em = Mark.define("em", {shape: {element: "em"}})
    let link = Mark.Type.define<string>("link", {
        rank: 50,
        shape: {attribute: "href", value: 0},
    })
    let classes = Mark.Type.define<string[]>("classes", {
        rank: 30,
        set: {compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0)},
        shape: {attribute: "class", value: (v) => v.join(" ")},
    })

    it("returns the same set when the mark is already present", () => {
        let set = bold.addToSet(Mark.none)
        expect(bold.addToSet(set)).toBe(set)
    })

    it("replaces a same-type non-set mark with a different value", () => {
        let set = link.of("/old").addToSet([bold])
        let next = link.of("/new").addToSet(set)
        expect(next.length).toBe(2)
        expect(link.isInSet(next)!.value).toBe("/new")
        expect(bold.isInSet(next)).toBeTruthy()
    })

    it("merges set-valued marks", () => {
        let set = classes.of(["a", "c"]).addToSet(Mark.none)
        let next = classes.of(["b", "c"]).addToSet(set)
        expect(classes.isInSet(next)!.value).toEqual(["a", "b", "c"])
    })

    it("appends when set is empty", () => {
        expect(bold.addToSet(Mark.none)).toEqual([bold])
    })

    it("keeps other marks when adding", () => {
        let set = em.addToSet([bold])
        expect(set.map((m) => m.name).sort()).toEqual(["bold", "em"].sort())
        expect(Mark.sameSet(set, em.addToSet([bold]))).toBe(true)
    })
})

describe("Mark.removeFromSet / Type.removeFromSet", () => {
    let bold = Mark.define("bold", {shape: {element: "strong"}})
    let em = Mark.define("em", {shape: {element: "em"}})
    let link = Mark.Type.define<string>("link", {shape: {attribute: "href", value: 0}})
    let classes = Mark.Type.define<string[]>("classes", {
        set: {compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0)},
        shape: {attribute: "class", value: (v) => v.join(" ")},
    })

    it("removes a matching flag mark and returns none for the last mark", () => {
        let set = bold.addToSet(Mark.none)
        expect(bold.removeFromSet(set)).toBe(Mark.none)
    })

    it("leaves the set unchanged when value does not match", () => {
        let set = link.of("/a").addToSet(Mark.none)
        expect(link.of("/b").removeFromSet(set)).toBe(set)
    })

    it("partially subtracts set-valued marks", () => {
        let set = classes.of(["a", "b", "c"]).addToSet(Mark.none)
        let next = classes.of(["b"]).removeFromSet(set)
        expect(classes.isInSet(next)!.value).toEqual(["a", "c"])
        let empty = classes.of(["a", "c"]).removeFromSet(next)
        expect(empty).toBe(Mark.none)
    })

    it("Type.removeFromSet drops any mark of that type", () => {
        let set = link.of("/x").addToSet([bold])
        let next = link.removeFromSet(set)
        expect(link.isInSet(next)).toBeNull()
        expect(bold.isInSet(next)).toBeTruthy()
    })

    it("returns the original set when the mark is absent", () => {
        let set = [bold] as Mark.Set
        expect(em.removeFromSet(set)).toBe(set)
        expect(em.type.removeFromSet(set)).toBe(set)
    })
})

describe("Mark.isInSet / Type.isInSet", () => {
    let link = Mark.Type.define<string>("link", {shape: {attribute: "href", value: 0}})
    let set = link.of("/a").addToSet(Mark.none)

    it("instance isInSet requires value equality", () => {
        expect(link.of("/a").isInSet(set)).toBeTruthy()
        expect(link.of("/b").isInSet(set)).toBeNull()
    })

    it("Type.isInSet matches by type only", () => {
        expect(link.isInSet(set)!.value).toBe("/a")
        expect(link.isInSet(Mark.none)).toBeNull()
    })
})
