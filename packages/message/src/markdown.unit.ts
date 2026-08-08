import {describe, expect, it} from "vitest"
import {Leaf, Schema, Slice} from "@arrisa/doc"
import {EditorSelection, EditorState, Transaction} from "@arrisa/state"
import {InlineDoc, LineBreak, Strong, Emphasis, Spoiler, Code, Strikethrough} from "@arrisa/types"
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
})
