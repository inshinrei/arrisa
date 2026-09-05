import {describe, expect, it} from "vitest"
import {shouldCollapseOnOutsidePointer} from "./input-state"

function chromeTarget(token: string) {
    return {
        closest(sel: string) {
            return sel.split(",").some((part) => part.trim() == token) ? this : null
        },
    }
}

describe("shouldCollapseOnOutsidePointer", () => {
    it("ignores an already empty selection", () => {
        expect(shouldCollapseOnOutsidePointer({contains: () => false}, chromeTarget("x"), true)).toBe(false)
    })

    it("ignores pointerdown inside the editor", () => {
        let target = chromeTarget("x")
        expect(shouldCollapseOnOutsidePointer({contains: (n) => n === target}, target, false)).toBe(false)
    })

    it("ignores tooltips, floating menu, and link prompt", () => {
        let editorDom = {contains: () => false}
        expect(shouldCollapseOnOutsidePointer(editorDom, chromeTarget("arrisa-tooltip"), false)).toBe(false)
        expect(shouldCollapseOnOutsidePointer(editorDom, chromeTarget(".arrisa-tooltip"), false)).toBe(false)
        expect(shouldCollapseOnOutsidePointer(editorDom, chromeTarget(".arrisa-floating-menu"), false)).toBe(false)
        expect(shouldCollapseOnOutsidePointer(editorDom, chromeTarget("arrisa-link-prompt"), false)).toBe(false)
    })

    it("collapses when the target is outside the editor and chrome", () => {
        let target = {closest: () => null}
        expect(shouldCollapseOnOutsidePointer({contains: () => false}, target, false)).toBe(true)
    })

    it("does not collapse when the target is missing", () => {
        expect(shouldCollapseOnOutsidePointer({contains: () => false}, null, false)).toBe(false)
    })

    it("treats a target without closest as chrome when parentElement matches", () => {
        let parent = chromeTarget("arrisa-tooltip")
        expect(shouldCollapseOnOutsidePointer({contains: () => false}, {parentElement: parent}, false)).toBe(false)
    })
})
