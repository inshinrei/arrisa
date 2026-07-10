import {describe, expect, it} from "vitest"
import {findCompositionSelection} from "./composition"

describe("findCompositionSelection", () => {
    it("maps offset within the composition target text node", () => {
        let target = {nodeValue: "hello"} as Text
        expect(findCompositionSelection(target, 3, target, 10)).toBe(13)
        expect(findCompositionSelection(target, 0, target, 10)).toBe(10)
    })

    it("returns end of target when selection node precedes the target", () => {
        let target = {nodeValue: "abc"} as Text
        let other = {
            compareDocumentPosition: () => 2, // DOCUMENT_POSITION_PRECEDING (other before target)
        } as unknown as Node
        expect(findCompositionSelection(other, 0, target, 5)).toBe(8)
    })

    it("returns start of target when selection node follows the target", () => {
        let target = {nodeValue: "abc"} as Text
        let other = {
            compareDocumentPosition: () => 4, // FOLLOWING
        } as unknown as Node
        expect(findCompositionSelection(other, 2, target, 5)).toBe(5)
    })
})
