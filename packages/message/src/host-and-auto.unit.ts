import {describe, expect, it} from "vitest"
import {Leaf, Mark, Schema} from "@arrisa/doc"
import {EditorSelection, EditorState, type Transaction} from "@arrisa/state"
import {
    Code,
    Emphasis,
    InlineDoc,
    LineBreak,
    Link,
    Spoiler,
    Strong,
    Strikethrough,
    Underline,
} from "@arrisa/types"
import {docToFormattedText} from "./to-formatted"
import {formattedTextToDoc} from "./from-formatted"
import {parseMarkdownText} from "./parse-markdown"
import {looksLikeMarkdown} from "./paste-markdown"
import {CustomEmoji, MentionName} from "./schema-elements"
import {insertCustomEmojiSpec, insertMentionSpec} from "./insert"
import {messengerCompose} from "./compose"
import {composeField} from "./compose-field"
import type {FormattedText} from "./entities"

function fullInlineSchema() {
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
        CustomEmoji,
        MentionName,
    ])
}

function applySpec(state: EditorState, spec: false | Transaction.Spec): EditorState {
    if (spec === false) throw new Error("expected transaction spec")
    return state.update(spec).state
}

describe("parseMarkdownText", () => {
    it("parses bold italic strike spoiler code and links", () => {
        let ft = parseMarkdownText("**a** __b__ ~~c~~ ||d|| `e` [go](https://x.test)")
        expect(ft.text).toBe("a b c d e go")
        expect(ft.entities).toEqual(
            expect.arrayContaining([
                {type: "bold", offset: 0, length: 1},
                {type: "italic", offset: 2, length: 1},
                {type: "strike", offset: 4, length: 1},
                {type: "spoiler", offset: 6, length: 1},
                {type: "code", offset: 8, length: 1},
                {type: "text_url", offset: 10, length: 2, url: "https://x.test"},
            ]),
        )
    })

    it("parses fenced pre with language", () => {
        let ft = parseMarkdownText("```ts\nlet x\n```")
        expect(ft.text).toBe("let x")
        expect(ft.entities).toEqual([{type: "pre", offset: 0, length: 5, language: "ts"}])
    })

    it("parses blockquote lines", () => {
        let ft = parseMarkdownText("> one\n> two")
        expect(ft.text).toBe("one\ntwo")
        expect(ft.entities?.some((e) => e.type == "blockquote" && e.offset == 0)).toBe(true)
    })
})

describe("looksLikeMarkdown", () => {
    it("detects common markers", () => {
        expect(looksLikeMarkdown("**x**")).toBe(true)
        expect(looksLikeMarkdown("plain")).toBe(false)
    })
})

describe("custom emoji + mention I/O", () => {
    it("exports and imports custom emoji leaves", () => {
        let schema = fullInlineSchema()
        let doc = schema.doc([
            Leaf.text("hi "),
            CustomEmoji.of({documentId: "42", alt: "😀"}),
            Leaf.text("!"),
        ])
        let ft = docToFormattedText(doc)
        expect(ft.text).toBe("hi 😀!")
        expect(ft.entities).toEqual(
            expect.arrayContaining([{type: "custom_emoji", offset: 3, length: 2, documentId: "42"}]),
        )
        let back = formattedTextToDoc(ft, schema)
        let round = docToFormattedText(back)
        expect(round).toEqual(ft)
    })

    it("exports and imports mention_name marks", () => {
        let schema = fullInlineSchema()
        let doc = schema.doc([Leaf.text("@alice", MentionName.of("u1").addToSet(Mark.none))])
        let ft = docToFormattedText(doc)
        expect(ft.entities).toEqual([{type: "mention_name", offset: 0, length: 6, userId: "u1"}])
        let back = formattedTextToDoc(ft, schema)
        expect(docToFormattedText(back)).toEqual(ft)
    })
})

describe("insert helpers", () => {
    it("inserts mention and custom emoji into state", () => {
        let schema = fullInlineSchema()
        let state = EditorState.create({
            doc: schema.doc([Leaf.text("x")]),
            selection: EditorSelection.cursor(1),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        let mention = insertMentionSpec(state, {userId: "9", label: "@bob"})
        state = applySpec(state, mention)
        expect(state.doc.textContent()).toContain("@bob")

        let emoji = insertCustomEmojiSpec(state, {documentId: "7", alt: "🎉"})
        state = applySpec(state, emoji)
        let ft = docToFormattedText(state.doc)
        expect(ft.entities?.some((e) => e.type == "custom_emoji")).toBe(true)
    })
})

describe("insertMention dump range", () => {
    it("replaces the dump range and leaves no leftover query", () => {
        let schema = fullInlineSchema()
        let state = EditorState.create({
            doc: schema.doc([Leaf.text("hi @al")]),
            selection: EditorSelection.cursor(1),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        let spec = insertMentionSpec(state, {
            userId: "u@ex",
            label: "@[u@ex]",
            from: 3,
            to: 6,
        })
        state = applySpec(state, spec)
        let ft = docToFormattedText(state.doc)
        expect(ft.text).toBe("hi @[u@ex]")
        expect(ft.entities).toEqual(
            expect.arrayContaining([{type: "mention_name", offset: 3, length: 7, userId: "u@ex"}]),
        )
        expect(ft.text.includes("@al")).toBe(false)
    })

    it("returns false for out-of-range from/to and does not change the doc", () => {
        let schema = fullInlineSchema()
        let state = EditorState.create({
            doc: schema.doc([Leaf.text("hi @al")]),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        expect(insertMentionSpec(state, {userId: "u@ex", label: "@[u@ex]", from: 999, to: 1000})).toBe(false)
        expect(state.doc.textContent()).toContain("@al")
    })

    it("returns false when only one of from/to is set", () => {
        let schema = fullInlineSchema()
        let state = EditorState.create({
            doc: schema.doc([Leaf.text("x")]),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        expect(insertMentionSpec(state, {userId: "u", label: "@u", from: 0} as any)).toBe(false)
    })

    it("maps dump offsets in a block compose doc", () => {
        let proto = EditorState.create({
            doc: "",
            config: composeField({floating: false, placeholder: false, markdown: false, hostElements: true}),
        })
        let doc = formattedTextToDoc({text: "hi @al"}, proto.schema)
        let state = EditorState.create({
            doc,
            config: composeField({floating: false, placeholder: false, markdown: false, hostElements: true}),
        })
        let spec = insertMentionSpec(state, {userId: "u@ex", label: "@[u@ex]", from: 3, to: 6})
        state = applySpec(state, spec)
        expect(docToFormattedText(state.doc).text).toBe("hi @[u@ex]")
    })

    it("maps dump offsets with mentionText when a prior mention is serialized", () => {
        let schema = fullInlineSchema()
        let mention = MentionName.of("u@ex").addToSet(Mark.none)
        let state = EditorState.create({
            doc: schema.doc([Leaf.text("Alice", mention), Leaf.text(" @al")]),
            selection: EditorSelection.cursor(0),
            config: [EditorState.schemaElement.of(schema.elements)],
        })
        let mentionText = (id: string) => `@[${id}]`
        let dump = docToFormattedText(state.doc, {mentionText})
        expect(dump.text).toBe("@[u@ex] @al")
        let from = dump.text.indexOf("@al")
        let to = from + 3
        let spec = insertMentionSpec(state, {
            userId: "v",
            label: "Bob",
            from,
            to,
            mentionText,
        })
        state = applySpec(state, spec)
        expect(state.doc.textContent()).toBe("Alice Bob")
        expect(docToFormattedText(state.doc, {mentionText}).text).toBe("@[u@ex] @[v]")
        expect(docToFormattedText(state.doc, {mentionText}).text.includes("@al")).toBe(false)
    })
})

describe("docToFormattedText autoDetect", () => {
    it("adds url entities when enabled", () => {
        let schema = fullInlineSchema()
        let doc = schema.doc([Leaf.text("go https://ex.com now")])
        let ft = docToFormattedText(doc, {autoDetect: true})
        expect(ft.entities?.some((e) => e.type == "url")).toBe(true)
    })

    it("keeps url under bold style marks", () => {
        let schema = fullInlineSchema()
        let doc = schema.doc([Leaf.text("https://ex.com", [Strong])])
        let ft = docToFormattedText(doc, {autoDetect: true})
        expect(ft.entities?.some((e) => e.type == "bold")).toBe(true)
        expect(ft.entities?.some((e) => e.type == "url")).toBe(true)
    })
})

describe("messengerCompose host elements", () => {
    it("registers CustomEmoji and MentionName", () => {
        let state = EditorState.create({
            doc: "",
            config: messengerCompose({
                floating: false,
                placeholder: false,
                markdown: false,
                markdownPaste: false,
            }),
        })
        expect(state.schema.getNode("CustomEmoji")).toBeTruthy()
        expect(state.schema.getMark("MentionName")).toBeTruthy()
    })
})

describe("formattedTextToDoc mention", () => {
    it("applies mention_name mark", () => {
        let schema = fullInlineSchema()
        let ft: FormattedText = {
            text: "@carol",
            entities: [{type: "mention_name", offset: 0, length: 6, userId: "c1"}],
        }
        let doc = formattedTextToDoc(ft, schema)
        expect(docToFormattedText(doc)).toEqual(ft)
    })
})

describe("mentionText serialize", () => {
    it("exports a serialized slice and shifts later entities", () => {
        let schema = fullInlineSchema()
        let mention = MentionName.of("u@ex").addToSet(Mark.none)
        let doc = schema.doc([
            Leaf.text("hi "),
            Leaf.text("Alice", mention),
            Leaf.text("!"),
        ])
        let ft = docToFormattedText(doc, {mentionText: (userId) => `@[${userId}]`})
        expect(ft.text).toBe("hi @[u@ex]!")
        expect(ft.entities).toEqual(
            expect.arrayContaining([{type: "mention_name", offset: 3, length: 7, userId: "u@ex"}]),
        )
    })

    it("keeps bold on the serialized mention slice", () => {
        let schema = fullInlineSchema()
        let marks = Strong.addToSet(MentionName.of("u@ex").addToSet(Mark.none))
        let doc = schema.doc([Leaf.text("Alice", marks)])
        let ft = docToFormattedText(doc, {mentionText: (userId) => `@[${userId}]`})
        expect(ft.text).toBe("@[u@ex]")
        expect(ft.entities).toEqual(
            expect.arrayContaining([
                {type: "mention_name", offset: 0, length: 7, userId: "u@ex"},
                {type: "bold", offset: 0, length: 7},
            ]),
        )
    })
})

describe("mentionLabel hydrate", () => {
    it("shows the display label while dump stays serialized", () => {
        let schema = fullInlineSchema()
        let ft = {
            text: "hi @[u@ex]",
            entities: [{type: "mention_name" as const, offset: 3, length: 7, userId: "u@ex"}],
        }
        let doc = formattedTextToDoc(ft, schema, {mentionLabel: () => "Alice"})
        expect(doc.textContent()).toBe("hi Alice")
        let round = docToFormattedText(doc, {mentionText: (id) => `@[${id}]`})
        expect(round.text).toBe("hi @[u@ex]")
        expect(round.entities).toEqual(
            expect.arrayContaining([{type: "mention_name", offset: 3, length: 7, userId: "u@ex"}]),
        )
    })
})

describe("autoDetect mention skip", () => {
    it("does not add type mention when MentionName is in the schema", () => {
        let schema = fullInlineSchema()
        let doc = schema.doc([Leaf.text("@[u@ex]", MentionName.of("u@ex").addToSet(Mark.none))])
        let ft = docToFormattedText(doc, {autoDetect: true})
        expect(ft.entities?.some((e) => e.type == "mention")).toBeFalsy()
        expect(ft.entities?.some((e) => e.type == "mention_name")).toBe(true)
    })

    it("does not auto-detect unmarked @alice when MentionName is in the schema", () => {
        let schema = fullInlineSchema()
        let doc = schema.doc([Leaf.text("hello @alice now")])
        let ft = docToFormattedText(doc, {autoDetect: true})
        expect(ft.entities?.some((e) => e.type == "mention")).toBeFalsy()
    })

    it("still adds mention when types explicitly include it", () => {
        let schema = fullInlineSchema()
        let doc = schema.doc([Leaf.text("hello @alice now")])
        let ft = docToFormattedText(doc, {autoDetect: {types: ["mention"]}})
        expect(ft.entities?.some((e) => e.type == "mention")).toBe(true)
    })
})
