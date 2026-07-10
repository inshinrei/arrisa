import {describe, expect, it} from "vitest"
import {defaultChild, F, findChild, findNextChild, type MenuElement} from "./menu-dom"

function elt(flags: F, index = 0): MenuElement {
    return {
        dom: {} as Element,
        focusDOM: {} as HTMLElement,
        index,
        item: {} as any,
        flags,
        update() {},
        children: null,
        run: null,
    }
}

describe("menu-dom helpers", () => {
    it("findChild skips disabled items", () => {
        let children = [elt(F.Disabled), elt(0 as F), elt(F.Disabled)]
        expect(findChild(children, true)).toBe(children[1])
        expect(findChild(children, false)).toBe(children[1])
    })

    it("findNextChild wraps and skips hidden", () => {
        let children = [elt(0 as F, 0), elt(F.Hidden, 1), elt(0 as F, 2)]
        expect(findNextChild(children, children[0], 1)).toBe(children[2])
        expect(findNextChild(children, children[2], 1)).toBe(children[0])
        expect(findNextChild(children, children[0], -1)).toBe(children[2])
    })

    it("defaultChild prefers active", () => {
        let children = [elt(0 as F), elt(F.Active), elt(0 as F)]
        expect(defaultChild(children)).toBe(children[1])
        expect(defaultChild([])).toBeNull()
    })
})
