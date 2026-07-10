import {describe, expect, it} from "vitest"
import {Menu} from "./menu"
import {selectAll} from "./motion"
import {testSchema} from "./util/test-helpers"

describe("Menu.resolve", () => {
    it("places explicit template buttons in order", () => {
        let btnA = Menu.Button.define({label: "A", run: selectAll, rank: 10})
        let btnB = Menu.Button.define({label: "B", run: selectAll, rank: 20})
        let group = Menu.Group.define()
        let template = group.template(btnA, btnB)
        let resolved = Menu.resolve([btnA, btnB], template)
        expect(resolved).toHaveLength(2)
        expect(resolved[0]).toBe(btnA)
        expect(resolved[1]).toBe(btnB)
    })

    it("expands '...' to children of the group by rank", () => {
        let group = Menu.Group.define()
        let late = Menu.Button.define({label: "late", run: selectAll, parent: group, rank: 80})
        let early = Menu.Button.define({label: "early", run: selectAll, parent: group, rank: 10})
        let template = group.template("...")
        let resolved = Menu.resolve([late, early], template)
        expect(resolved).toHaveLength(2)
        expect(resolved[0]).toBe(early)
        expect(resolved[1]).toBe(late)
    })

    it("skips suppressed items", () => {
        let group = Menu.Group.define()
        let keep = Menu.Button.define({label: "keep", run: selectAll, parent: group, rank: 10})
        let drop = Menu.Button.define({label: "drop", run: selectAll, parent: group, rank: 20})
        let resolved = Menu.resolve([keep, drop], group.template("..."), [drop])
        expect(resolved).toEqual([keep])
    })

    it("inserts margin separators around margin groups", () => {
        let root = Menu.Group.define()
        let marginGroup = Menu.Group.define({parent: root, margin: true, rank: 50})
        let side = Menu.Button.define({label: "side", run: selectAll, parent: root, rank: 10})
        let mid = Menu.Button.define({label: "mid", run: selectAll, parent: marginGroup, rank: 10})
        let template = root.template("...")
        // Register both groups as items so "..." under root can find marginGroup
        let resolved = Menu.resolve([side, marginGroup, mid], template)
        // side, then margin separator, mid, trailing margin separator stripped at end
        expect(resolved.includes("|")).toBe(true)
        expect(resolved.some((r) => r === side)).toBe(true)
        expect(resolved.some((r) => r === mid)).toBe(true)
    })

    it("overflows excess items into a submenu", () => {
        let group = Menu.Group.define({overflow: {at: 2}})
        let a = Menu.Button.define({label: "a", run: selectAll, parent: group, rank: 10})
        let b = Menu.Button.define({label: "b", run: selectAll, parent: group, rank: 20})
        let c = Menu.Button.define({label: "c", run: selectAll, parent: group, rank: 30})
        let resolved = Menu.resolve([a, b, c], group.template("..."))
        // at=2 → one visible slot + overflow submenu containing the rest
        expect(resolved).toHaveLength(2)
        expect(resolved[0]).toBe(a)
        expect(resolved[1]).toBeInstanceOf(Menu.Submenu.Resolved)
        let overflow = resolved[1] as Menu.Submenu.Resolved
        expect(overflow.content).toContain(b)
        expect(overflow.content).toContain(c)
    })

    it("resolves a nested submenu", () => {
        let root = Menu.Group.define()
        let sub = Menu.Submenu.define({label: "more", parent: root, rank: 10})
        let inner = Menu.Button.define({label: "inner", run: selectAll, parent: sub, rank: 10})
        let resolved = Menu.resolve([sub, inner], root.template("..."))
        expect(resolved).toHaveLength(1)
        expect(resolved[0]).toBeInstanceOf(Menu.Submenu.Resolved)
        let node = resolved[0] as Menu.Submenu.Resolved
        expect(node.item).toBe(sub)
        expect(node.content).toEqual([inner])
    })
})

describe("Menu.Button.toggleMark", () => {
    it("binds the mark toggle command", () => {
        let {bold} = testSchema()
        let btn = Menu.Button.toggleMark({mark: bold, label: "B"})
        expect(btn.run).toBeTruthy()
        expect(typeof btn.active).toBe("function")
    })
})
