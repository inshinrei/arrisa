import {describe, expect, it} from "vitest"
import {Leaf, Schema} from "@arrisa/doc"
import {
    Blockquote,
    BulletList,
    Code,
    CodeBlock,
    CodeBlockLanguage,
    Doc,
    Emphasis,
    InlineDoc,
    LineBreak,
    Link,
    ListItem,
    OrderedList,
    Paragraph,
    Spoiler,
    Strong,
    Strikethrough,
    Underline,
} from "@arrisa/types"
import {docToFormattedText} from "./to-formatted"
import {formattedTextToDoc, materializeRuns} from "./from-formatted"
import type {FormattedText} from "./entities"

function inlineSchema() {
    return Schema.define([
        InlineDoc,
        LineBreak,
        Strong,
        Emphasis,
        Underline,
        Strikethrough,
        Spoiler,
        Code,
        Link,
    ])
}

function blockSchema() {
    return Schema.define([
        Doc,
        Paragraph,
        CodeBlock,
        CodeBlockLanguage,
        Blockquote,
        BulletList,
        OrderedList,
        ListItem,
        LineBreak,
        Strong,
        Emphasis,
        Spoiler,
        Code,
        Link,
    ])
}

describe("docToFormattedText", () => {
    it("exports plain text with no entities", () => {
        let schema = inlineSchema()
        let doc = schema.doc([Leaf.text("hello")])
        expect(docToFormattedText(doc)).toEqual({text: "hello"})
    })

    it("exports nested marks with UTF-16 offsets", () => {
        let schema = inlineSchema()
        let doc = schema.doc([
            Leaf.text("ab", [Strong]),
            Leaf.text("cd", [Strong, Emphasis]),
            Leaf.text("e"),
        ])
        let ft = docToFormattedText(doc)
        expect(ft.text).toBe("abcde")
        expect(ft.entities).toEqual(
            expect.arrayContaining([
                {type: "bold", offset: 0, length: 4},
                {type: "italic", offset: 2, length: 2},
            ]),
        )
    })

    it("exports spoiler and link", () => {
        let schema = inlineSchema()
        let doc = schema.doc([
            Leaf.text("hid", [Spoiler]),
            Leaf.text(" "),
            Leaf.text("go", [Link.of("https://example.com")]),
        ])
        let ft = docToFormattedText(doc)
        expect(ft.text).toBe("hid go")
        expect(ft.entities).toEqual(
            expect.arrayContaining([
                {type: "spoiler", offset: 0, length: 3},
                {type: "text_url", offset: 4, length: 2, url: "https://example.com"},
            ]),
        )
    })

    it("uses UTF-16 length for emoji", () => {
        let schema = inlineSchema()
        // 😀 is two UTF-16 code units
        let doc = schema.doc([Leaf.text("a😀b", [Strong])])
        let ft = docToFormattedText(doc)
        expect(ft.text).toBe("a😀b")
        expect(ft.text.length).toBe(4)
        expect(ft.entities).toEqual([{type: "bold", offset: 0, length: 4}])
    })

    it("exports pre for code blocks and blockquote ranges", () => {
        let schema = blockSchema()
        let doc = schema.doc([
            Paragraph.create([Leaf.text("hi")]),
            CodeBlock.create([Leaf.text("x = 1")]),
            Blockquote.create([Paragraph.create([Leaf.text("q")])]),
        ])
        let ft = docToFormattedText(doc)
        expect(ft.text).toBe("hi\nx = 1\nq")
        expect(ft.entities).toEqual(
            expect.arrayContaining([
                {type: "pre", offset: 3, length: 5},
                {type: "blockquote", offset: 9, length: 1},
            ]),
        )
    })

    it("exports pre language when CodeBlockLanguage is set", () => {
        let schema = blockSchema()
        let tag = CodeBlock.withMarks(CodeBlockLanguage.of("ts").addToSet(CodeBlock.marks))
        let doc = schema.doc([tag.create([Leaf.text("let x")])])
        let ft = docToFormattedText(doc)
        expect(ft.entities).toEqual([{type: "pre", offset: 0, length: 5, language: "ts"}])
    })
})

describe("formattedTextToDoc", () => {
    it("round-trips inline marks", () => {
        let schema = inlineSchema()
        let original = schema.doc([
            Leaf.text("ab", [Strong]),
            Leaf.text("cd", [Strong, Emphasis]),
        ])
        let ft = docToFormattedText(original)
        let back = formattedTextToDoc(ft, schema)
        expect(docToFormattedText(back)).toEqual(ft)
    })

    it("imports spoiler and link", () => {
        let schema = inlineSchema()
        let ft: FormattedText = {
            text: "hid go",
            entities: [
                {type: "spoiler", offset: 0, length: 3},
                {type: "text_url", offset: 4, length: 2, url: "https://example.com"},
            ],
        }
        let doc = formattedTextToDoc(ft, schema)
        expect(docToFormattedText(doc)).toEqual(ft)
    })

    it("round-trips emoji bold range", () => {
        let schema = inlineSchema()
        let ft: FormattedText = {
            text: "a😀b",
            entities: [{type: "bold", offset: 0, length: 4}],
        }
        let doc = formattedTextToDoc(ft, schema)
        expect(docToFormattedText(doc)).toEqual(ft)
    })

    it("imports pre as code block in block schema", () => {
        let schema = blockSchema()
        let ft: FormattedText = {
            text: "hi\nx=1",
            entities: [{type: "pre", offset: 3, length: 3}],
        }
        let doc = formattedTextToDoc(ft, schema)
        let out = docToFormattedText(doc)
        expect(out.text).toBe("hi\nx=1")
        expect(out.entities?.some((e) => e.type == "pre" && e.offset == 3 && e.length == 3)).toBe(true)
    })

    it("imports quote-only docs as Blockquote", () => {
        let schema = blockSchema()
        let ft: FormattedText = {
            text: "a\nb",
            entities: [{type: "blockquote", offset: 0, length: 3}],
        }
        let doc = formattedTextToDoc(ft, schema)
        expect(doc.content.length).toBe(1)
        expect(doc.content[0]!.type.name).toBe("Blockquote")
        let out = docToFormattedText(doc)
        expect(out.text).toBe("a\nb")
        expect(out.entities?.some((e) => e.type == "blockquote" && e.offset == 0)).toBe(true)
    })

    it("imports partial mid-document blockquote", () => {
        let schema = blockSchema()
        // "hi\nq" — quote only covers "q"
        let ft: FormattedText = {
            text: "hi\nq",
            entities: [{type: "blockquote", offset: 3, length: 1}],
        }
        let doc = formattedTextToDoc(ft, schema)
        let names = doc.content.map((n) => n.type.name)
        expect(names).toContain("Paragraph")
        expect(names).toContain("Blockquote")
        let out = docToFormattedText(doc)
        expect(out.text).toBe("hi\nq")
        expect(out.entities?.some((e) => e.type == "blockquote" && e.offset == 3 && e.length == 1)).toBe(true)
    })

    it("round-trips pre + blockquote export", () => {
        let schema = blockSchema()
        let original = schema.doc([
            Paragraph.create([Leaf.text("hi")]),
            CodeBlock.create([Leaf.text("x = 1")]),
            Blockquote.create([Paragraph.create([Leaf.text("q")])]),
        ])
        let ft = docToFormattedText(original)
        let back = formattedTextToDoc(ft, schema)
        expect(docToFormattedText(back)).toEqual(ft)
    })

    it("round-trips a bullet list", () => {
        let schema = blockSchema()
        let doc = schema.doc([
            BulletList.create([
                ListItem.create([Paragraph.create([Leaf.text("a")])]),
                ListItem.create([Paragraph.create([Leaf.text("b")])]),
            ]),
        ])
        let ft = docToFormattedText(doc)
        expect(ft.text).toBe("a\nb")
        expect(ft.entities?.some((e) => e.type == "unordered_list" && e.offset == 0 && e.length == ft.text.length)).toBe(
            true,
        )
        let back = formattedTextToDoc(ft, schema)
        expect(docToFormattedText(back).entities?.some((e) => e.type == "unordered_list")).toBe(true)
        expect(back.firstChild!.type.name).toBe("BulletList")
    })

    it("exports ordered list startIndex when not 1", () => {
        let schema = blockSchema()
        let doc = schema.doc([
            OrderedList.of(3).create([ListItem.create([Paragraph.create([Leaf.text("x")])])]),
        ])
        let ft = docToFormattedText(doc)
        expect(ft.entities).toEqual(
            expect.arrayContaining([{type: "ordered_list", offset: 0, length: 1, startIndex: 3}]),
        )
    })

    it("wraps a list inside a blockquote", () => {
        let schema = blockSchema()
        let list = BulletList.create([ListItem.create([Paragraph.create([Leaf.text("q")])])])
        let doc = schema.doc([Blockquote.create([list])])
        let ft = docToFormattedText(doc)
        let back = formattedTextToDoc(ft, schema)
        expect(back.firstChild!.type.name).toBe("Blockquote")
        expect(back.firstChild!.content[0]!.type.name).toBe("BulletList")
    })
})

describe("materializeRuns", () => {
    it("splits overlapping entities into runs", () => {
        let schema = inlineSchema()
        let runs = materializeRuns(
            "abcd",
            [
                {type: "bold", offset: 0, length: 3},
                {type: "italic", offset: 2, length: 2},
            ],
            schema,
        )
        expect(runs.map((r) => r.text)).toEqual(["ab", "c", "d"])
        expect(Strong.isInSet(runs[0].marks)).toBeTruthy()
        expect(Emphasis.isInSet(runs[0].marks)).toBeFalsy()
        expect(Strong.isInSet(runs[1].marks)).toBeTruthy()
        expect(Emphasis.isInSet(runs[1].marks)).toBeTruthy()
        expect(Emphasis.isInSet(runs[2].marks)).toBeTruthy()
        expect(Strong.isInSet(runs[2].marks)).toBeFalsy()
    })
})
