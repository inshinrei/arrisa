import {describe, expect, it} from "vitest"
import {none} from "../../util/utils"
import {addSet, remove, subtractSet} from "./set"

let cmp = (a: number, b: number) => a - b

describe("remove", () => {
    it("returns the shared none singleton when removing the only element", () => {
        expect(remove([1], 0)).toBe(none)
    })

    it("drops the element at the given index", () => {
        expect(remove([1, 2, 3], 1)).toEqual([1, 3])
        expect(remove([1, 2, 3], 0)).toEqual([2, 3])
        expect(remove([1, 2, 3], 2)).toEqual([1, 2])
    })
})

describe("addSet", () => {
    it("unions sorted arrays and preserves order", () => {
        expect(addSet([1, 3, 5], [2, 4], cmp)).toEqual([1, 2, 3, 4, 5])
    })

    it("dedupes equal elements across the two inputs", () => {
        expect(addSet([1, 2, 3], [2, 3, 4], cmp)).toEqual([1, 2, 3, 4])
        expect(addSet([1], [1], cmp)).toEqual([1])
    })

    it("handles empty inputs", () => {
        expect(addSet([], [1, 2], cmp)).toEqual([1, 2])
        expect(addSet([1, 2], [], cmp)).toEqual([1, 2])
        expect(addSet([], [], cmp)).toEqual([])
    })
})

describe("subtractSet", () => {
    it("returns elements of a not present in b", () => {
        expect(subtractSet([1, 2, 3, 4], [2, 4], cmp)).toEqual([1, 3])
    })

    it("returns a unchanged when b is empty", () => {
        expect(subtractSet([1, 2], [], cmp)).toEqual([1, 2])
    })

    it("returns empty when all of a is in b", () => {
        expect(subtractSet([1, 2], [1, 2, 3], cmp)).toEqual([])
    })

    it("removes only one equal element per match (advances both sides)", () => {
        expect(subtractSet([1, 1, 2], [1], cmp)).toEqual([1, 2])
    })
})
