import {describe, expect, it} from "vitest"
import {enter, insertLineBreak} from "@arrisa/command"
import {Leaf, Schema, Slice} from "@arrisa/doc"
import {blockDoc, codeBlock, lineBreak, paragraph} from "@arrisa/schema"
import {EditorSelection, EditorState, Transaction} from "@arrisa/state"
import {
    CodeBlock,
    CodeBlockLanguage,
    InlineDoc,
    LineBreak,
    Strong,
    Emphasis,
    Spoiler,
    Code,
    Strikethrough,
} from "@arrisa/types"
import {composeField} from "./compose-field"
import {MARKDOWN_INLINE_DELIMITERS} from "./markdown-delimiters"
import {markdownInputRules} from "./markdown"

function makeState(text: string) {
    let schema = Schema.define([
        InlineDoc,
        LineBreak,
        Strong,
        Emphasis,
        Spoiler,
        Code,
        Strikethrough,
    ])
    let doc = schema.doc(text ? [Leaf.text(text)] : [])
    return EditorState.create({
        doc,
        selection: EditorSelection.cursor(text.length),
        config: [EditorState.schemaElement.of(schema.elements), markdownInputRules()],
    })
}

function typeChars(state: EditorState, chars: string) {
    let cur = state
    for (let ch of chars) {
        let head = cur.selection.head
        let tr = cur.update({
            changes: {from: head, to: head, insert: Slice.of([Leaf.text(ch)])},
            selection: EditorSelection.cursor(head + ch.length),
            userEvent: "input.type",
        })
        let chain = Transaction.append(tr)
        cur = chain[chain.length - 1].state
    }
    return cur
}

function dispatch(state: EditorState, spec: false | Transaction.Spec) {
    if (!spec) throw new Error("command did not apply")
    let tr = state.update(spec)
    let chain = Transaction.append(tr)
    return chain[chain.length - 1]!.state
}

function makeBlockState() {
    return EditorState.create({
        doc: "",
        config: [blockDoc(), paragraph(), codeBlock(), lineBreak(), markdownInputRules()],
    })
}

describe("markdownInputRules", () => {
    it("converts **bold** on closing stars", () => {
        let state = makeState("")
        state = typeChars(state, "**hi**")
        expect(state.doc.textContent()).toBe("hi")
        let leaf = state.doc.content.find((n) => n.isText)
        expect(leaf).toBeTruthy()
        expect(Strong.isInSet(leaf!.marks)).toBeTruthy()
    })

    it("converts ||spoiler||", () => {
        let state = makeState("")
        state = typeChars(state, "||x||")
        let leaf = state.doc.content.find((n) => n.isText && n.isLeaf)
        expect(leaf && leaf.isText ? leaf.param : null).toBe("x")
        expect(Spoiler.isInSet(leaf!.marks)).toBeTruthy()
    })

    it("converts `code`", () => {
        let state = makeState("")
        state = typeChars(state, "`c`")
        let leaf = state.doc.content.find((n) => n.isText && n.isLeaf)
        expect(leaf && leaf.isText ? leaf.param : null).toBe("c")
        expect(Code.isInSet(leaf!.marks)).toBeTruthy()
    })

    it("does not treat ```x` as inline code", () => {
        let state = makeState("")
        state = typeChars(state, "```x`")
        expect(state.doc.textContent()).toBe("```x`")
        state.doc.iterate((node) => {
            if (node.isText) expect(Code.isInSet(node.marks)).toBeFalsy()
        })
    })

    it("keeps the inline code parse pattern and guards the input pattern", () => {
        let code = MARKDOWN_INLINE_DELIMITERS.find((d) => d.entity == "code")
        expect(code?.inputSource).toBe("(?<!`)`([^`\\n]+)`$")
        expect(code?.parseSource).toBe("`([^`\\n]+)`")
    })
})

describe("markdown code fences", () => {
    it("turns ```hello``` into one code block", () => {
        let state = makeBlockState()
        state = typeChars(state, "```hello```")
        expect(state.doc.content.length).toBe(1)
        expect(state.doc.content[0]!.type).toBe(CodeBlock.type)
        expect(state.doc.textContent()).toBe("hello")
        expect(state.selection.head).toBe(1 + "hello".length)
    })

    it("splits a multi-line fence body into text and line breaks", () => {
        let state = makeBlockState()
        state = typeChars(state, "```")
        state = dispatch(state, insertLineBreak({state}, null))
        state = typeChars(state, "a")
        state = dispatch(state, insertLineBreak({state}, null))
        state = typeChars(state, "b")
        state = dispatch(state, insertLineBreak({state}, null))
        state = typeChars(state, "```")
        let block = state.doc.content[0]!
        expect(block.type).toBe(CodeBlock.type)
        expect(block.isPlot && block.textContent()).toBe("a\nb")
        if (!block.isPlot) return
        expect(block.content.map((node) => node.type.name)).toEqual(["Text", "LineBreak", "Text"])
    })

    it("turns a line-break fence in one paragraph into a code block", () => {
        let state = makeBlockState()
        state = typeChars(state, "```ts")
        state = dispatch(state, insertLineBreak({state}, null))
        state = typeChars(state, "let x = 1")
        state = dispatch(state, insertLineBreak({state}, null))
        state = typeChars(state, "```")
        expect(state.doc.content.length).toBe(1)
        expect(state.doc.content[0]!.type).toBe(CodeBlock.type)
        expect(state.doc.content[0]!.mark(CodeBlockLanguage)).toBe("ts")
        expect(state.doc.textContent()).toBe("let x = 1")
    })

    it("closes a fence across paragraphs", () => {
        let state = makeBlockState()
        state = typeChars(state, "```")
        state = dispatch(state, enter({state}, null))
        state = typeChars(state, "let x = 1")
        state = dispatch(state, enter({state}, null))
        state = typeChars(state, "```")
        expect(state.doc.content.length).toBe(1)
        expect(state.doc.content[0]!.type).toBe(CodeBlock.type)
        expect(state.doc.textContent()).toBe("let x = 1")
        expect(state.doc.content[0]!.mark(CodeBlockLanguage)).toBeUndefined()
    })

    it("reads the language from the opening fence paragraph", () => {
        let state = makeBlockState()
        state = typeChars(state, "```ts")
        state = dispatch(state, enter({state}, null))
        state = typeChars(state, "let x = 1")
        state = dispatch(state, enter({state}, null))
        state = typeChars(state, "```")
        expect(state.doc.content.length).toBe(1)
        expect(state.doc.content[0]!.type).toBe(CodeBlock.type)
        expect(state.doc.content[0]!.mark(CodeBlockLanguage)).toBe("ts")
        expect(state.doc.textContent()).toBe("let x = 1")
    })

    it("composeField turns a finished fence into a code block", () => {
        let state = EditorState.create({
            doc: "",
            config: composeField({floating: false, placeholder: false, markdownPaste: false}),
        })
        state = typeChars(state, "```hello```")
        expect(state.doc.content.length).toBe(1)
        expect(state.doc.content[0]!.type).toBe(CodeBlock.type)
        expect(state.doc.textContent()).toBe("hello")
    })

    it("keeps paragraphs before the opening fence", () => {
        let state = makeBlockState()
        state = typeChars(state, "hello")
        state = dispatch(state, enter({state}, null))
        state = typeChars(state, "```")
        state = dispatch(state, enter({state}, null))
        state = typeChars(state, "x")
        state = dispatch(state, enter({state}, null))
        state = typeChars(state, "```")
        expect(state.doc.content.length).toBe(2)
        let before = state.doc.content[0]!
        let fenced = state.doc.content[1]!
        expect(before.type.name).toBe("Paragraph")
        expect(before.isPlot && before.textContent()).toBe("hello")
        expect(fenced.type).toBe(CodeBlock.type)
        expect(fenced.isPlot && fenced.textContent()).toBe("x")
    })

    it("does not throw when the schema cannot contain a code block", () => {
        let state = EditorState.create({
            doc: "",
            config: [blockDoc(), paragraph(), lineBreak(), markdownInputRules()],
        })
        expect(() => {
            state = typeChars(state, "```hello```")
        }).not.toThrow()
        expect(state.doc.textContent()).toBe("```hello```")
        expect(state.doc.content[0]!.type.name).not.toBe("CodeBlock")
    })

    it("does not run inside an existing code block", () => {
        let state = makeBlockState()
        state = typeChars(state, "```hello```")
        state = typeChars(state, "```")
        expect(state.doc.content.length).toBe(1)
        expect(state.doc.content[0]!.type).toBe(CodeBlock.type)
        expect(state.doc.textContent()).toBe("hello```")
    })

    it("does not throw or create a code block on an inline document", () => {
        let state = makeState("")
        expect(() => {
            state = typeChars(state, "```hello```")
        }).not.toThrow()
        expect(state.doc.textContent()).toBe("```hello```")
        let sawBlock = false
        state.doc.iterate((node) => {
            if (node.type.name == "CodeBlock") sawBlock = true
        })
        expect(sawBlock).toBe(false)
    })
})
