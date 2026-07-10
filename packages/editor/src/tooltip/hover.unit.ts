import {describe, expect, it} from "vitest"
import {isInTooltip, isOverRange} from "./hover"
import type {Arrisa} from "../editor"

function mouse(x: number, y: number): MouseEvent {
    return {clientX: x, clientY: y} as MouseEvent
}

describe("isInTooltip", () => {
    it("returns true inside the tooltip box (with margin)", () => {
        let tooltip = {
            getBoundingClientRect: () => ({left: 10, right: 50, top: 10, bottom: 40}),
            querySelector: () => null,
        } as unknown as HTMLElement
        expect(isInTooltip(tooltip, mouse(10, 10))).toBe(true)
        expect(isInTooltip(tooltip, mouse(6, 20))).toBe(true) // 4px margin
        expect(isInTooltip(tooltip, mouse(5, 20))).toBe(false)
    })

    it("expands vertical bounds when an arrow is present", () => {
        let tooltip = {
            getBoundingClientRect: () => ({left: 0, right: 40, top: 20, bottom: 50}),
            querySelector: () => ({
                getBoundingClientRect: () => ({left: 10, right: 20, top: 10, bottom: 20}),
            }),
        } as unknown as HTMLElement
        // y=12 is above the main box but inside the arrow
        expect(isInTooltip(tooltip, mouse(15, 12))).toBe(true)
    })
})

describe("isOverRange", () => {
    function editor(rect: {left: number; right: number; top: number; bottom: number}, pos: number): Arrisa {
        return {
            contentDOM: {
                getBoundingClientRect: () => rect,
            },
            posAtCoords: () => ({pos}),
        } as any
    }

    it("returns false when outside content bounds even with margin", () => {
        let ed = editor({left: 0, right: 100, top: 0, bottom: 50}, 5)
        expect(isOverRange(ed, 0, 10, 200, 25, 6)).toBe(false)
    })

    it("allows coordinates within the margin of the content box", () => {
        let ed = editor({left: 10, right: 100, top: 10, bottom: 50}, 3)
        expect(isOverRange(ed, 0, 10, 6, 20, 6)).toBe(true)
        expect(isOverRange(ed, 0, 10, 3, 20, 6)).toBe(false)
    })

    it("requires the mapped position to lie in [from, to]", () => {
        let ed = editor({left: 0, right: 100, top: 0, bottom: 50}, 20)
        expect(isOverRange(ed, 0, 10, 50, 25, 0)).toBe(false)
        expect(isOverRange(ed, 0, 20, 50, 25, 0)).toBe(true)
    })
})
