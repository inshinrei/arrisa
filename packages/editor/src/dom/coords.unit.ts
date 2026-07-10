import {describe, expect, it} from "vitest"
import {caretRectFromCharBox} from "./coords"

/** Minimal DOMRect for node vitest (no browser globals). */
class Rect {
    constructor(
        readonly x: number,
        readonly y: number,
        readonly width: number,
        readonly height: number,
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

// caretRectFromCharBox constructs `new DOMRect(...)` internally
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

function box(left: number, top: number, width: number, height: number) {
    return new Rect(left, top, width, height) as unknown as DOMRect
}

describe("caretRectFromCharBox", () => {
    it("LTR: assoc 1 → left edge, assoc -1 → right edge", () => {
        let glyph = box(10, 0, 8, 16)

        let before = caretRectFromCharBox(glyph, 1, true)
        expect(before.left).toBe(10)
        expect(before.right).toBe(10)
        expect(before.width).toBe(0)
        expect(before.height).toBe(16)

        let after = caretRectFromCharBox(glyph, -1, true)
        expect(after.left).toBe(18)
        expect(after.right).toBe(18)
        expect(after.width).toBe(0)
        expect(after.height).toBe(16)
    })

    it("RTL: assoc 1 → right edge, assoc -1 → left edge", () => {
        let glyph = box(20, 2, 10, 14)

        let before = caretRectFromCharBox(glyph, 1, false)
        expect(before.left).toBe(30)
        expect(before.width).toBe(0)

        let after = caretRectFromCharBox(glyph, -1, false)
        expect(after.left).toBe(20)
        expect(after.width).toBe(0)
    })

    it("zero-width input stays zero-width (edge choice is a no-op)", () => {
        let caret = box(5, 1, 0, 12)
        expect(caretRectFromCharBox(caret, 1, true).left).toBe(5)
        expect(caretRectFromCharBox(caret, -1, true).left).toBe(5)
    })

    it("shared boundary: end of char N and start of char N+1 align in LTR", () => {
        // char at [10, 18), next char at [18, 26)
        let charN = box(10, 0, 8, 16)
        let charN1 = box(18, 0, 8, 16)
        let afterN = caretRectFromCharBox(charN, -1, true)
        let beforeN1 = caretRectFromCharBox(charN1, 1, true)
        expect(afterN.left).toBe(beforeN1.left)
        expect(afterN.left).toBe(18)
    })
})
