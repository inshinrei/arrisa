import {describe, expect, it} from "vitest"
import {EditorState} from "@arrisa/state"
import {
    Code,
    CodeBlock,
    CodeBlockLanguage,
    Doc,
    InlineDoc,
    Paragraph,
    Spoiler,
    Strong,
    Strikethrough,
} from "@arrisa/types"
import {markExclusivityPolicy} from "@arrisa/command"
import {messengerCompose} from "./compose"

describe("messengerCompose", () => {
    it("installs messenger marks on InlineDoc", () => {
        let state = EditorState.create({
            doc: "",
            config: messengerCompose({floating: false, placeholder: false, markdown: false}),
        })
        expect(state.schema.has(InlineDoc)).toBe(true)
        expect(state.schema.has(Spoiler)).toBe(true)
        expect(state.schema.has(Strong)).toBe(true)
        expect(state.schema.has(Code)).toBe(true)
    })

    it("codeBlocks: true installs Doc, Paragraph, and CodeBlock", () => {
        let state = EditorState.create({
            doc: "",
            config: messengerCompose({
                codeBlocks: true,
                floating: false,
                placeholder: false,
                markdown: false,
            }),
        })
        expect(state.schema.has(Doc)).toBe(true)
        expect(state.schema.has(Paragraph)).toBe(true)
        expect(state.schema.has(CodeBlock)).toBe(true)
        expect(state.schema.has(CodeBlockLanguage)).toBe(true)
        expect(state.schema.has(InlineDoc)).toBe(false)
        expect(state.schema.has(Code)).toBe(true)
    })

    it("applies code-strike exclusivity when requested", () => {
        let state = EditorState.create({
            doc: "",
            config: messengerCompose({
                exclusivity: "code-strike",
                floating: false,
                placeholder: false,
                markdown: false,
            }),
        })
        let policy = markExclusivityPolicy(state)
        expect(policy.isolating.map((t) => t.name).sort()).toEqual(["Code", "Strikethrough"].sort())
        expect(state.schema.has(Strikethrough)).toBe(true)
    })
})
