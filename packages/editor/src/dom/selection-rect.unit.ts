import {describe, expect, it} from "vitest"
import {clientBoxFromRects} from "./selection-rect"

/** Minimal DOMRect for node vitest (no browser globals). */
if (typeof globalThis.DOMRect === "undefined") {
    ;(globalThis as any).DOMRect = class DOMRect {
        constructor(
            public x = 0,
            public y = 0,
            public width = 0,
            public height = 0,
        ) {}
        get left() {
            return this.x
        }
        get top() {
            return this.y
        }
        get right() {
            return this.x + this.width
        }
        get bottom() {
            return this.y + this.height
        }
    }
}

describe("clientBoxFromRects", () => {
    it("copies a collapsed caret with width 0 and keeps height", () => {
        let a = new DOMRect(10, 20, 0, 16)
        expect(clientBoxFromRects(a)).toEqual({top: 20, left: 10, width: 0, height: 16})
    })

    it("unions two ends of a range", () => {
        let a = new DOMRect(10, 20, 0, 16)
        let b = new DOMRect(40, 18, 0, 16)
        expect(clientBoxFromRects(a, b)).toEqual({
            top: 18,
            left: 10,
            width: 30,
            height: 18,
        })
    })
})
