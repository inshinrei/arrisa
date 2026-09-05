import {describe, expect, it} from "vitest"
import {inputEventRange} from "./handlers"

describe("inputEventRange", () => {
    it("falls back to selection when getTargetRanges is empty", () => {
        let editor = {
            state: {selection: {from: 1, to: 3}},
        } as any
        let event = {
            getTargetRanges() {
                return []
            },
        } as unknown as InputEvent

        expect(inputEventRange(event, editor)).toEqual({from: 1, to: 3})
    })
})
