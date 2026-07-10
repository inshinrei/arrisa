import {describe, expect, it} from "vitest"
import {
    BackgroundColor,
    Code,
    Color,
    Emphasis,
    Spoiler,
    Strong,
    Strikethrough,
    Subscript,
    Superscript,
    Underline,
} from "@arrisa/types"
import {blockDoc, paragraph} from "./block"
import {backgroundColor, color} from "./color"
import {code, emphasis, spoiler, strikethrough, strong, subscript, superscript, underline} from "./mark"
import {makeState} from "./test-helpers"

describe("mark factories", () => {
    it("registers each inline mark type", () => {
        let state = makeState([
            blockDoc(),
            paragraph(),
            strong(),
            emphasis(),
            code(),
            underline(),
            strikethrough(),
            spoiler(),
            superscript(),
            subscript(),
        ])
        expect(state.schema.has(Strong)).toBe(true)
        expect(state.schema.has(Emphasis)).toBe(true)
        expect(state.schema.has(Code)).toBe(true)
        expect(state.schema.has(Underline)).toBe(true)
        expect(state.schema.has(Strikethrough)).toBe(true)
        expect(state.schema.has(Spoiler)).toBe(true)
        expect(state.schema.has(Superscript)).toBe(true)
        expect(state.schema.has(Subscript)).toBe(true)
    })

    it("color and backgroundColor register color marks", () => {
        let state = makeState([blockDoc(), paragraph(), color(), backgroundColor()])
        expect(state.schema.has(Color)).toBe(true)
        expect(state.schema.has(BackgroundColor)).toBe(true)
    })
})
