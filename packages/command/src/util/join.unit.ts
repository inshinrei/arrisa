import {describe, expect, it} from "vitest"
import {type Plot} from "@arrisa/doc"
import {EditorSelection} from "@arrisa/state"
import {joinBackward, joinForward, joinListItems} from "./join"
import {para, run, stateFromBlocks} from "./test-helpers"

describe("joinBackward", () => {
    it("returns false mid-text and for non-cursors", () => {
        let {state} = stateFromBlocks((s) => [para(s, "ab"), para(s, "cd")], 2)
        expect(joinBackward(state)).toBe(false)
        let ranged = stateFromBlocks((s) => [para(s, "ab"), para(s, "cd")], EditorSelection.range(1, 2))
        expect(joinBackward(ranged.state)).toBe(false)
    })

    it("merges the previous paragraph into the current one", () => {
        // pos 5 = start of second para "cd"
        let {state} = stateFromBlocks((s) => [para(s, "ab"), para(s, "cd")], 5)
        let result = run(state, joinBackward)
        expect(result.applied).toBe(true)
        expect(result.state.doc.textContent()).toBe("abcd")
        expect(result.state.doc.content.length).toBe(1)
    })
})

describe("joinForward", () => {
    it("returns false mid-text", () => {
        let {state} = stateFromBlocks((s) => [para(s, "ab"), para(s, "cd")], 2)
        expect(joinForward(state)).toBe(false)
    })

    it("merges the next paragraph into the current one and sets selection", () => {
        // pos 3 = end of first para "ab"
        let {state} = stateFromBlocks((s) => [para(s, "ab"), para(s, "cd")], 3)
        let result = run(state, joinForward)
        expect(result.applied).toBe(true)
        expect(result.state.doc.textContent()).toBe("abcd")
        expect(result.state.doc.content.length).toBe(1)
        expect(result.state.selection.isCursor).toBe(true)
    })
})

describe("joinListItems", () => {
    it("joins adjacent list items when the cursor is at the start of the second item", () => {
        // pos 9 = start of second list item (before its paragraph child)
        let {state} = stateFromBlocks(
            (s) => [
                s.bulletList.create([
                    s.listItem.create([para(s, "one")]),
                    s.listItem.create([para(s, "two")]),
                ]),
            ],
            9,
        )
        let result = run(state, joinListItems)
        expect(result.applied).toBe(true)
        let outer = result.state.doc.content[0] as Plot
        expect(outer.name).toBe("bullet_list")
        expect(outer.content.length).toBe(1)
        expect(result.state.doc.textContent().replace(/\n/g, "")).toBe("onetwo")
    })

    it("returns false mid-paragraph", () => {
        let {state} = stateFromBlocks(
            (s) => [
                s.bulletList.create([
                    s.listItem.create([para(s, "one")]),
                    s.listItem.create([para(s, "two")]),
                ]),
            ],
            4,
        )
        expect(joinListItems(state)).toBe(false)
    })
})
