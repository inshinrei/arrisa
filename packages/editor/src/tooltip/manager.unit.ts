import {describe, expect, it} from "vitest"
import {TooltipViewManager, setLeftStyle} from "./manager"
import type {Tooltip} from "./types"
import type {Arrisa} from "../editor"

function fakeUpdate(facetValue: readonly (Tooltip | null)[], connected = true): Arrisa.Update {
    return {
        state: {
            facet: () => facetValue,
        },
        editor: {connected},
    } as any
}

function fakeEditor(facetValue: readonly (Tooltip | null)[] = []): Arrisa {
    return {
        state: {
            facet: () => facetValue,
        },
        connected: true,
    } as any
}

function tip(id: string, create = () => view(id)): Tooltip {
    return {
        pos: 0,
        create: create as any,
    }
}

function view(id: string): Tooltip.View {
    return {
        dom: {id, style: {}, classList: {add() {}}, querySelector: () => null} as any,
        update() {},
        remove() {},
        disconnect() {},
    }
}

describe("setLeftStyle", () => {
    it("sets left when current is not a number", () => {
        let elt = {style: {left: ""}} as HTMLElement
        setLeftStyle(elt, 12.4)
        expect(elt.style.left).toBe("12.4px")
    })

    it("skips updates within 1px", () => {
        let elt = {style: {left: "10px"}} as HTMLElement
        setLeftStyle(elt, 10.4)
        expect(elt.style.left).toBe("10px")
    })

    it("updates when delta exceeds 1px", () => {
        let elt = {style: {left: "10px"}} as HTMLElement
        setLeftStyle(elt, 12)
        expect(elt.style.left).toBe("12px")
    })
})

describe("TooltipViewManager", () => {
    it("creates views for initial facet tooltips", () => {
        let created: string[] = []
        let a = tip("a", () => {
            created.push("a")
            return view("a")
        })
        let manager = new TooltipViewManager(
            fakeEditor([a]),
            {of: () => {}} as any,
            (t) => t.create(fakeEditor()),
            () => {},
        )
        // facet reader is called as editor.state.facet(facet) — constructor uses facet as key via state.facet
        // Our fake ignores the key and returns facetValue from fakeEditor
        expect(manager.tooltips.length).toBe(1)
        expect(created).toEqual(["a"])
    })

    it("returns false and only updates views when facet input is identical", () => {
        let updates = 0
        let create = () => {
            let v = view("x")
            v.update = () => {
                updates++
            }
            return v
        }
        let t = tip("x", create)
        let input = [t]
        let manager = new TooltipViewManager(fakeEditor(input), {} as any, (tip) => tip.create(fakeEditor()), () => {})
        let changed = manager.update(fakeUpdate(input))
        expect(changed).toBe(false)
        expect(updates).toBe(1)
    })

    it("reuses views matched by create identity and removes stale ones", () => {
        let removed: string[] = []
        let createA = () => view("a")
        let createB = () => view("b")
        let a = tip("a", createA)
        let b = tip("b", createB)
        let manager = new TooltipViewManager(
            fakeEditor([a, b]),
            {} as any,
            (t) => t.create(fakeEditor()),
            (v) => {
                removed.push((v.dom as any).id)
            },
        )
        let a2 = tip("a2", createA)
        let changed = manager.update(fakeUpdate([a2]))
        expect(changed).toBe(true)
        expect(manager.tooltips.length).toBe(1)
        expect(removed).toEqual(["b"])
        expect((manager.tooltipViews[0].dom as any).id).toBe("a")
    })

    it("disconnects and removes views when the editor is connected", () => {
        let disconnects = 0
        let removes = 0
        let create = () => {
            let v = view("z")
            v.disconnect = () => {
                disconnects++
            }
            v.remove = () => {
                removes++
            }
            return v
        }
        let t = tip("z", create)
        let manager = new TooltipViewManager(fakeEditor([t]), {} as any, (tip) => tip.create(fakeEditor()), () => {})
        manager.update(fakeUpdate([], true))
        expect(disconnects).toBe(1)
        expect(removes).toBe(1)
    })
})
