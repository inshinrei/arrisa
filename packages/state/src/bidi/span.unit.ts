import {describe, expect, it} from "vitest"
import {BidiSpan, type Isolate, isolatesEq} from "./span"

describe("BidiSpan.ltr", () => {
    it("is true for even levels and false for odd", () => {
        expect(new BidiSpan(0, 1, 0).ltr).toBe(true)
        expect(new BidiSpan(0, 1, 1).ltr).toBe(false)
        expect(new BidiSpan(0, 1, 2).ltr).toBe(true)
    })
})

describe("BidiSpan.side / forward", () => {
    let ltrSpan = new BidiSpan(2, 8, 0)
    let rtlSpan = new BidiSpan(2, 8, 1)

    it("side maps end of visual progress under base LTR", () => {
        // LTR span under LTR base: end of forward progress is `to`
        expect(ltrSpan.side(true, true)).toBe(8)
        expect(ltrSpan.side(false, true)).toBe(2)
        // RTL span under LTR base: end of forward progress is `from`
        expect(rtlSpan.side(true, true)).toBe(2)
        expect(rtlSpan.side(false, true)).toBe(8)
    })

    it("forward is true when visual forward matches logical increase", () => {
        expect(ltrSpan.forward(true, true)).toBe(true)
        expect(ltrSpan.forward(false, true)).toBe(false)
        expect(rtlSpan.forward(true, true)).toBe(false)
        expect(rtlSpan.forward(false, true)).toBe(true)
    })
})

describe("BidiSpan.find", () => {
    // Nested-style spans: outer LTR [0,10] level 0, inner RTL [3,7] level 1
    let order = [new BidiSpan(0, 3, 0), new BidiSpan(3, 7, 1), new BidiSpan(7, 10, 0)]

    it("finds the unique span covering an interior index", () => {
        expect(BidiSpan.find(order, 1, 0)).toBe(0)
        expect(BidiSpan.find(order, 5, 0)).toBe(1)
        expect(BidiSpan.find(order, 8, 0)).toBe(2)
    })

    it("prefers lower level when assoc is 0 at a shared boundary", () => {
        // index 3 is on the boundary of span0 (to) and span1 (from)
        let idx = BidiSpan.find(order, 3, 0)
        expect(order[idx].level).toBe(0)
    })

    it("uses assoc to pick side at a boundary between equal-level spans", () => {
        let flat = [new BidiSpan(0, 5, 0), new BidiSpan(5, 10, 0)]
        expect(BidiSpan.find(flat, 5, -1)).toBe(0) // bias left
        expect(BidiSpan.find(flat, 5, 1)).toBe(1) // bias right
    })

    it("throws RangeError when index is out of range", () => {
        expect(() => BidiSpan.find(order, -1, 0)).toThrow(RangeError)
        expect(() => BidiSpan.find(order, 11, 0)).toThrow(RangeError)
        expect(() => BidiSpan.find([], 0, 0)).toThrow(RangeError)
    })
})

describe("isolatesEq", () => {
    let a: Isolate = {from: 0, to: 4, ltr: true, inner: []}
    let b: Isolate = {from: 0, to: 4, ltr: true, inner: []}
    let nested: Isolate = {
        from: 0,
        to: 10,
        ltr: false,
        inner: [{from: 2, to: 5, ltr: true, inner: []}],
    }

    it("returns true for equal trees", () => {
        expect(isolatesEq([], [])).toBe(true)
        expect(isolatesEq([a], [b])).toBe(true)
        expect(isolatesEq([nested], [{...nested, inner: [...nested.inner]}])).toBe(true)
    })

    it("returns false on structural mismatches", () => {
        expect(isolatesEq([a], [])).toBe(false)
        expect(isolatesEq([a], [{...a, to: 5}])).toBe(false)
        expect(isolatesEq([a], [{...a, ltr: false}])).toBe(false)
        expect(isolatesEq([nested], [{...nested, inner: []}])).toBe(false)
    })
})
