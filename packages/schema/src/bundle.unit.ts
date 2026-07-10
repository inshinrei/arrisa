import {describe, expect, it} from "vitest"
import {
    Alignment,
    Blockquote,
    BulletList,
    Code,
    CodeBlock,
    Color,
    Direction,
    Doc,
    Emphasis,
    Figure,
    Heading,
    HorizontalRule,
    Image,
    ImageSize,
    InlineDoc,
    LineBreak,
    Link,
    OrderedList,
    Paragraph,
    Spoiler,
    Strong,
    Strikethrough,
    Subscript,
    Superscript,
    Underline,
} from "@arrisa/types"
import {
    basicMarks,
    basicSchema,
    fullSchema,
    inlineMarks,
    inlineSchema,
    lineBreak,
    messengerMarks,
    messengerSchema,
} from "./bundle"
import {makeState} from "./test-helpers"

describe("basicSchema", () => {
    it("registers doc root, blocks, and basic marks", () => {
        let state = makeState(basicSchema())
        expect(state.schema.has(Doc)).toBe(true)
        expect(state.schema.has(Paragraph)).toBe(true)
        expect(state.schema.has(Heading)).toBe(true)
        expect(state.schema.has(LineBreak)).toBe(true)
        expect(state.schema.has(Strong)).toBe(true)
        expect(state.schema.has(Emphasis)).toBe(true)
        expect(state.schema.has(Link)).toBe(true)
        expect(state.doc.length).toBeGreaterThan(0)
    })
})

describe("inlineSchema", () => {
    it("registers an inline doc root with marks and image", () => {
        let state = makeState(inlineSchema())
        expect(state.schema.has(InlineDoc)).toBe(true)
        expect(state.schema.has(Strong)).toBe(true)
        expect(state.schema.has(Link)).toBe(true)
        expect(state.schema.has(Image)).toBe(true)
        expect(state.schema.has(LineBreak)).toBe(true)
    })
})

describe("messengerSchema", () => {
    it("registers messenger format marks on InlineDoc", () => {
        let state = makeState(messengerSchema())
        expect(state.schema.has(InlineDoc)).toBe(true)
        expect(state.schema.has(Spoiler)).toBe(true)
        expect(state.schema.has(Strong)).toBe(true)
        expect(state.schema.has(Emphasis)).toBe(true)
        expect(state.schema.has(Underline)).toBe(true)
        expect(state.schema.has(Strikethrough)).toBe(true)
        expect(state.schema.has(Code)).toBe(true)
        expect(state.schema.has(Link)).toBe(true)
        expect(state.schema.has(LineBreak)).toBe(true)
        // document-only surfaces stay out of the messenger preset
        expect(state.schema.has(Heading)).toBe(false)
        expect(state.schema.has(Image)).toBe(false)
    })

    it("messengerMarks registers spoiler and code among other chat marks", () => {
        let state = makeState([messengerMarks(), inlineSchema()])
        expect(state.schema.has(Spoiler)).toBe(true)
        expect(state.schema.has(Code)).toBe(true)
    })
})

describe("fullSchema", () => {
    it("registers the full rich-text surface", () => {
        let state = makeState(fullSchema())
        expect(state.schema.has(Doc)).toBe(true)
        expect(state.schema.has(Paragraph)).toBe(true)
        expect(state.schema.has(Heading)).toBe(true)
        expect(state.schema.has(CodeBlock)).toBe(true)
        expect(state.schema.has(Alignment)).toBe(true)
        expect(state.schema.has(Direction)).toBe(true)
        expect(state.schema.has(Blockquote)).toBe(true)
        expect(state.schema.has(HorizontalRule)).toBe(true)
        expect(state.schema.has(BulletList)).toBe(true)
        expect(state.schema.has(OrderedList)).toBe(true)
        expect(state.schema.has(Code)).toBe(true)
        expect(state.schema.has(Underline)).toBe(true)
        expect(state.schema.has(Strikethrough)).toBe(true)
        expect(state.schema.has(Superscript)).toBe(true)
        expect(state.schema.has(Subscript)).toBe(true)
        expect(state.schema.has(Color)).toBe(true)
        expect(state.schema.has(Image)).toBe(true)
        expect(state.schema.has(Figure)).toBe(true)
        expect(state.schema.has(ImageSize)).toBe(true)
    })
})

describe("mark bundles", () => {
    it("basicMarks installs strong, emphasis, and link", () => {
        let state = makeState([basicSchema(), basicMarks()])
        expect(state.schema.has(Strong)).toBe(true)
        expect(state.schema.has(Emphasis)).toBe(true)
        expect(state.schema.has(Link)).toBe(true)
    })

    it("inlineMarks extends basic marks with code family and colors", () => {
        let state = makeState([basicSchema(), inlineMarks()])
        expect(state.schema.has(Code)).toBe(true)
        expect(state.schema.has(Underline)).toBe(true)
        expect(state.schema.has(Strikethrough)).toBe(true)
        expect(state.schema.has(Color)).toBe(true)
    })

    it("lineBreak registers the hard break leaf", () => {
        let state = makeState([basicSchema(), lineBreak()])
        expect(state.schema.has(LineBreak)).toBe(true)
    })
})
