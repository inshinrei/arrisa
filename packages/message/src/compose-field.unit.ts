import {describe, expect, it} from "vitest"
import {Leaf, Slice} from "@arrisa/doc"
import {EditorSelection, EditorState, Transaction} from "@arrisa/state"
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
import {flagEntity} from "./entities"
import {formattedTextToDoc} from "./from-formatted"
import {entityToMark} from "./mark-map"

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
        cur = chain[chain.length - 1]!.state
    }
    return cur
}

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

    it("does not apply spoiler markdown on typing", () => {
        let state = EditorState.create({
            doc: "",
            config: composeField({floating: false, placeholder: false}),
        })
        expect(state.schema.has(Spoiler)).toBe(false)
        state = typeChars(state, "||x||")
        expect(state.doc.textContent()).toBe("||x||")
        let spoiler = false
        state.doc.iterate((node) => {
            if (node.isText && Spoiler.isInSet(node.marks)) spoiler = true
        })
        expect(spoiler).toBe(false)
    })

    it("entityToMark skips spoiler when Spoiler is not in the schema", () => {
        let state = EditorState.create({
            doc: "",
            config: composeField({floating: false, placeholder: false, markdown: false}),
        })
        expect(entityToMark(flagEntity("spoiler", 0, 1), state.schema)).toBeNull()
        let doc = formattedTextToDoc({text: "hi", entities: [flagEntity("spoiler", 0, 2)]}, state.schema)
        expect(doc.textContent()).toBe("hi")
        let spoiler = false
        doc.iterate((node) => {
            if (node.isText && Spoiler.isInSet(node.marks)) spoiler = true
        })
        expect(spoiler).toBe(false)
    })
})
