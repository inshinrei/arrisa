import {describe, expect, it} from "vitest"
import {addSection} from "./deco-set"

describe("addSection", () => {
    it("pushes the first section", () => {
        let sections: number[] = []
        addSection(sections, 5, -1)
        expect(sections).toEqual([5, -1])
    })

    it("coalesces adjacent keep sections", () => {
        let sections: number[] = []
        addSection(sections, 5, -1)
        addSection(sections, 3, -1)
        expect(sections).toEqual([8, -1])
    })

    it("coalesces adjacent dirty sections", () => {
        let sections: number[] = []
        addSection(sections, 2, -2)
        addSection(sections, 4, -2)
        expect(sections).toEqual([6, -2])
    })

    it("coalesces positive insert sections by summing lengths", () => {
        let sections: number[] = []
        addSection(sections, 2, 3)
        addSection(sections, 1, 4)
        expect(sections).toEqual([3, 7])
    })

    it("does not coalesce different kinds of sections", () => {
        let sections: number[] = []
        addSection(sections, 5, -1)
        addSection(sections, 2, -2)
        addSection(sections, 3, -1)
        expect(sections).toEqual([5, -1, 2, -2, 3, -1])
    })
})
