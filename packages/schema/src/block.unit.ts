import {describe, expect, it} from "vitest"
import {
    Alignment,
    Blockquote,
    CodeBlock,
    CodeBlockLanguage,
    Direction,
    Doc,
    Heading,
    HorizontalRule,
    Paragraph,
} from "@arrisa/types"
import {
    alignment,
    blockDoc,
    blockquote,
    codeBlock,
    direction,
    heading,
    horizontalRule,
    inlineDoc,
    paragraph,
} from "./block"
import {makeState, typeAtEnd} from "./test-helpers"

describe("block factories", () => {
    it("blockDoc and paragraph register the default document", () => {
        let state = makeState([blockDoc(), paragraph()])
        expect(state.schema.has(Doc)).toBe(true)
        expect(state.schema.has(Paragraph)).toBe(true)
    })

    it("heading, codeBlock, blockquote, horizontalRule register types", () => {
        let state = makeState([blockDoc(), paragraph(), heading(), codeBlock(), blockquote(), horizontalRule()])
        expect(state.schema.has(Heading)).toBe(true)
        expect(state.schema.has(CodeBlock)).toBe(true)
        expect(state.schema.has(CodeBlockLanguage)).toBe(true)
        expect(state.schema.has(Blockquote)).toBe(true)
        expect(state.schema.has(HorizontalRule)).toBe(true)
    })

    it("alignment and direction register marks", () => {
        let state = makeState([blockDoc(), paragraph(), alignment(), direction()])
        expect(state.schema.has(Alignment)).toBe(true)
        expect(state.schema.has(Direction)).toBe(true)
    })

    it("inlineDoc builds an inline-only schema root", () => {
        let state = makeState(inlineDoc())
        expect(state.schema.has(Doc)).toBe(false)
    })
})

describe("block input rules", () => {
    it("heading.createOnHash turns '# ' into a heading", () => {
        // Target types must be in the schema for textblockType rules to apply.
        let state = makeState([blockDoc(), paragraph(), heading()], {selection: 1})
        let chain = typeAtEnd(state, "#")
        state = chain[chain.length - 1].state
        chain = typeAtEnd(state, " ")
        state = chain[chain.length - 1].state
        let block = state.doc.content[0]
        expect(block.tag.eq(Heading.of(1))).toBe(true)
        expect(state.doc.textContent()).toBe("")
    })

    it("codeBlock.createOnBackticks turns '``` ' into a code block", () => {
        let state = makeState([blockDoc(), paragraph(), codeBlock()], {selection: 1})
        for (let ch of "``` ") {
            let chain = typeAtEnd(state, ch)
            state = chain[chain.length - 1].state
        }
        let block = state.doc.content[0]
        expect(block.tag.eq(CodeBlock)).toBe(true)
        expect(block.tag.mark(CodeBlockLanguage)).toBeUndefined()
    })

    it("codeBlock.createOnBackticks captures '```ts ' as CodeBlockLanguage", () => {
        let state = makeState([blockDoc(), paragraph(), codeBlock()], {selection: 1})
        for (let ch of "```ts ") {
            let chain = typeAtEnd(state, ch)
            state = chain[chain.length - 1].state
        }
        let block = state.doc.content[0]
        expect(block.type).toBe(CodeBlock.type)
        expect(block.tag.mark(CodeBlockLanguage)).toBe("ts")
    })

    it("blockquote.createOnGT wraps on '> '", () => {
        let state = makeState([blockDoc(), paragraph(), blockquote()], {selection: 1})
        let chain = typeAtEnd(state, ">")
        state = chain[chain.length - 1].state
        chain = typeAtEnd(state, " ")
        state = chain[chain.length - 1].state
        let top = state.doc.content[0]
        expect(top.type).toBe(Blockquote.type)
    })

    it("horizontalRule.createOnDashes inserts an hr for ---", () => {
        let state = makeState([blockDoc(), paragraph(), horizontalRule()], {selection: 1})
        for (let ch of "---") {
            let chain = typeAtEnd(state, ch)
            state = chain[chain.length - 1].state
        }
        let types = state.doc.content.map((n) => n.type)
        expect(types.some((t) => t == HorizontalRule.type)).toBe(true)
    })
})
