import {describe, expect, it} from "vitest"
import {EditorState} from "@arrisa/state"
import {KeyBinding} from "@arrisa/editor"
import {
    Blockquote,
    BulletList,
    CodeBlock,
    Doc,
    InlineDoc,
    OrderedList,
    Spoiler,
    Strong,
} from "@arrisa/types"
import {composeField} from "./compose-field"

describe("composeField", () => {
    it("installs composeSchema and composeKeymap", () => {
        let state = EditorState.create({
            doc: "",
            config: composeField({floating: false, placeholder: false, markdown: false}),
        })
        expect(state.schema.has(Doc)).toBe(true)
        expect(state.schema.has(Strong)).toBe(true)
        expect(state.schema.has(BulletList)).toBe(true)
        expect(state.schema.has(OrderedList)).toBe(true)
        expect(state.schema.has(Blockquote)).toBe(true)
        expect(state.schema.has(CodeBlock)).toBe(true)
        expect(state.schema.has(InlineDoc)).toBe(false)
        expect(state.schema.has(Spoiler)).toBe(false)
        expect(state.facet(KeyBinding.useDefaultKeymap)).toBe(false)
    })

    it("does not install host elements by default", () => {
        let state = EditorState.create({
            doc: "",
            config: composeField({floating: false, placeholder: false, markdown: false}),
        })
        expect(state.schema.getNode("CustomEmoji")).toBeFalsy()
    })
})
