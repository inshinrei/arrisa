import {describe, expect, it} from "vitest"
import {
    addOutsidePointerChrome,
    outsidePointerChromeRoots,
    shouldCollapseOnOutsidePointer,
} from "./input-state"

function chromeTarget(token: string) {
    return {
        closest(sel: string) {
            return sel.split(",").some((part) => part.trim() == token) ? this : null
        },
    }
}

describe("shouldCollapseOnOutsidePointer", () => {
    it("ignores an already empty selection", () => {
        expect(shouldCollapseOnOutsidePointer({contains: () => false}, [chromeTarget("x")], true)).toBe(false)
    })

    it("ignores pointerdown inside the editor", () => {
        let target = {...chromeTarget("x"), nodeType: 1}
        expect(shouldCollapseOnOutsidePointer({contains: (n) => n === target}, [target], false)).toBe(false)
    })

    it("ignores a composed path that includes the editor (shadow retarget)", () => {
        let editorDom = {contains: () => false}
        let inner = {closest: () => null}
        expect(shouldCollapseOnOutsidePointer(editorDom, [inner, editorDom], false)).toBe(false)
    })

    it("ignores tooltips, floating menu, link prompt, and menubar in the path", () => {
        let editorDom = {contains: () => false}
        expect(shouldCollapseOnOutsidePointer(editorDom, [chromeTarget("arrisa-tooltip")], false)).toBe(false)
        expect(shouldCollapseOnOutsidePointer(editorDom, [chromeTarget(".arrisa-tooltip")], false)).toBe(false)
        expect(shouldCollapseOnOutsidePointer(editorDom, [chromeTarget(".arrisa-floating-menu")], false)).toBe(false)
        expect(shouldCollapseOnOutsidePointer(editorDom, [chromeTarget("arrisa-link-prompt")], false)).toBe(false)
        expect(shouldCollapseOnOutsidePointer(editorDom, [chromeTarget("arrisa-menubar")], false)).toBe(false)
        expect(shouldCollapseOnOutsidePointer(editorDom, [chromeTarget(".arrisa-menubar")], false)).toBe(false)
    })

    it("collapses when the path is outside the editor and chrome", () => {
        let target = {closest: () => null}
        expect(shouldCollapseOnOutsidePointer({contains: () => false}, [target], false)).toBe(true)
    })

    it("collapses when the path is document.body only", () => {
        let target = {closest: () => null}
        expect(shouldCollapseOnOutsidePointer({contains: () => false}, [target], false)).toBe(true)
        expect(shouldCollapseOnOutsidePointer({contains: () => false}, [target], false, [])).toBe(true)
    })

    it("collapses when composedPath includes window (non-Node) without calling contains on it", () => {
        let editorDom = {
            contains(node: any) {
                if (node == null || typeof node.nodeType != "number") {
                    throw new TypeError("Failed to execute 'contains' on 'Node': parameter 1 is not of type 'Node'.")
                }
                return false
            },
        }
        let outside = {closest: () => null, nodeType: 1}
        let win = {}
        expect(shouldCollapseOnOutsidePointer(editorDom, [outside, win], false)).toBe(true)
    })

    it("does not collapse when the path is missing or empty", () => {
        expect(shouldCollapseOnOutsidePointer({contains: () => false}, null, false)).toBe(false)
        expect(shouldCollapseOnOutsidePointer({contains: () => false}, [], false)).toBe(false)
    })

    it("treats a path entry without closest as chrome when parentElement matches", () => {
        let parent = chromeTarget("arrisa-tooltip")
        expect(shouldCollapseOnOutsidePointer({contains: () => false}, [{parentElement: parent}], false)).toBe(
            false,
        )
    })

    it("does not collapse when a registered chrome root is on the path", () => {
        let inner = {closest: () => null, nodeType: 1}
        let root = {
            contains(node: any) {
                return node === inner
            },
        }
        expect(shouldCollapseOnOutsidePointer({contains: () => false}, [inner, root], false, [root])).toBe(false)
    })

    it("addOutsidePointerChrome is read by outsidePointerChromeRoots", () => {
        let editor = {}
        let inner = {closest: () => null, nodeType: 1}
        let root = {
            contains(node: any) {
                return node === inner
            },
        }
        addOutsidePointerChrome(editor, root)
        expect(
            shouldCollapseOnOutsidePointer(
                {contains: () => false},
                [inner],
                false,
                outsidePointerChromeRoots(editor),
            ),
        ).toBe(false)
    })
})
