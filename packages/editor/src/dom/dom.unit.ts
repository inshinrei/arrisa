import {describe, expect, it} from "vitest"
import {DOMSelectionState, getScale, maxOffset} from "./dom"

describe("DOMSelectionState", () => {
    it("tracks empty and equality", () => {
        let a = new DOMSelectionState()
        expect(a.empty).toBe(true)
        a.set("n1" as any, 1, "n1" as any, 1)
        expect(a.empty).toBe(true)
        a.set("n1" as any, 1, "n2" as any, 2)
        expect(a.empty).toBe(false)

        let b = new DOMSelectionState()
        b.set("n1" as any, 1, "n2" as any, 2)
        expect(a.eq(b)).toBe(true)
        b.set("n1" as any, 1, "n2" as any, 3)
        expect(a.eq(b)).toBe(false)
    })

    it("setRange clamps offsets via maxOffset when nodes look like text", () => {
        let text = {nodeType: 3, nodeValue: "hi"} as unknown as Node
        let state = new DOMSelectionState()
        state.setRange({
            anchorNode: text,
            anchorOffset: 99,
            focusNode: text,
            focusOffset: -1 as any,
        })
        // Math.min(99, 2) => 2; Math.min(-1, 2) => -1 (no lower clamp)
        expect(state.anchorOffset).toBe(2)
        expect(state.focusOffset).toBe(-1)
    })
})

describe("maxOffset", () => {
    it("uses text length or child count", () => {
        expect(maxOffset({nodeType: 3, nodeValue: "abc"} as any)).toBe(3)
        expect(maxOffset({nodeType: 1, childNodes: {length: 4}} as any)).toBe(4)
    })
})

describe("getScale", () => {
    it("returns 1 when sizes match closely", () => {
        let elt = {offsetWidth: 100, offsetHeight: 50} as HTMLElement
        let rect = {width: 100, height: 50} as DOMRect
        expect(getScale(elt, rect)).toEqual({scaleX: 1, scaleY: 1})
    })

    it("returns 1 for non-finite or near-equal absolute delta", () => {
        let elt = {offsetWidth: 0, offsetHeight: 10} as HTMLElement
        let rect = {width: 0, height: 10} as DOMRect
        let s = getScale(elt, rect)
        expect(s.scaleX).toBe(1)
    })

    it("computes scale when CSS pixels differ from offset box", () => {
        let elt = {offsetWidth: 100, offsetHeight: 100} as HTMLElement
        let rect = {width: 200, height: 50} as DOMRect
        let s = getScale(elt, rect)
        expect(s.scaleX).toBe(2)
        expect(s.scaleY).toBe(0.5)
    })
})
