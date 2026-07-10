import {describe, expect, it} from "vitest"
import {
    listIsActive,
    setTextblockType,
    toggleBlock,
    toggleList,
    unwrapBlock,
    wrapBlock,
} from "./structure"
import {para, runPure, stateFromBlocks} from "./test-helpers"

describe("wrapBlock / unwrapBlock / toggleBlock", () => {
    it("wraps a paragraph in a blockquote", () => {
        let {state, blockquote} = stateFromBlocks((s) => [para(s, "hi")], 1)
        let result = runPure(state, wrapBlock, blockquote)
        expect(result.applied).toBe(true)
        // Outer open is blockquote
        expect(result.state.doc.content[0].type.name).toBe("blockquote")
    })

    it("unwraps a blockquote", () => {
        let {state, blockquote} = stateFromBlocks((s) => [s.blockquote.create([para(s, "hi")])], 2)
        let result = runPure(state, unwrapBlock, blockquote)
        expect(result.applied).toBe(true)
        expect(result.state.doc.content[0].type.name).toBe("paragraph")
    })

    it("toggleBlock wraps then unwraps", () => {
        let {state, blockquote} = stateFromBlocks((s) => [para(s, "hi")], 1)
        let wrapped = runPure(state, toggleBlock, blockquote)
        expect(wrapped.applied).toBe(true)
        expect(wrapped.state.doc.content[0].type.name).toBe("blockquote")
        let unwrapped = runPure(wrapped.state, toggleBlock, blockquote)
        expect(unwrapped.applied).toBe(true)
        expect(unwrapped.state.doc.content[0].type.name).toBe("paragraph")
    })
})

describe("setTextblockType", () => {
    it("returns false when the type is already set", () => {
        let {state, paragraph} = stateFromBlocks((s) => [para(s, "hi")], 1)
        expect(setTextblockType({state}, paragraph)).toBe(false)
    })
})

describe("toggleList / listIsActive", () => {
    it("wraps selected paragraphs in a bullet list", () => {
        let {state, bulletList} = stateFromBlocks((s) => [para(s, "one")], 1)
        let result = runPure(state, toggleList, bulletList)
        expect(result.applied).toBe(true)
        expect(result.state.doc.content[0].type.name).toBe("bullet_list")
        expect(listIsActive(bulletList)(result.state)).toBe(true)
    })

    it("removes the list on a second toggle", () => {
        let {state, bulletList} = stateFromBlocks((s) => {
            return [s.bulletList.create([s.listItem.create([para(s, "one")])])]
        }, 3)
        expect(listIsActive(bulletList)(state)).toBe(true)
        let result = runPure(state, toggleList, bulletList)
        expect(result.applied).toBe(true)
        expect(listIsActive(bulletList)(result.state)).toBe(false)
    })

    it("listIsActive is false for plain paragraphs", () => {
        let {state, bulletList} = stateFromBlocks((s) => [para(s, "x")], 1)
        expect(listIsActive(bulletList)(state)).toBe(false)
    })
})
