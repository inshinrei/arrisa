import {describe, expect, it} from "vitest"
import {Attributes, Leaf, type Elt} from "@arrisa/doc"
import {Decoration} from "@arrisa/editor"
import {EditorState} from "@arrisa/state"
import {CodeBlock, CodeBlockLanguage} from "@arrisa/types"
import {composeField} from "./compose-field"
import {docToFormattedText} from "./to-formatted"

function wrapperClass(deco: Decoration.Range): string | null {
    if (!("elt" in deco)) return null
    let elt = (deco as {elt: Elt}).elt
    return Attributes.get(elt.attrs, "class")
}

describe("code block highlight dump", () => {
    it("keeps the uncolored pre dump while painting kw-flow", () => {
        let text = "if (ok) return true"
        let config = composeField({floating: false, placeholder: false, markdown: false})
        let proto = EditorState.create({doc: "", config})
        let tag = CodeBlock.withMarks(CodeBlockLanguage.of("ts").addToSet(CodeBlock.marks))
        let doc = proto.schema.doc([tag.create([Leaf.text(text)])])
        let state = EditorState.create({doc, config})
        expect(docToFormattedText(state.doc)).toEqual({
            text,
            entities: [{type: "pre", offset: 0, length: text.length, language: "ts"}],
        })
        let found = false
        for (let source of state.facet(Decoration.Range.source)) {
            let set = source(state)
            for (let i = 0; i < set.length; i++) {
                if (wrapperClass(set.values[i]!)?.includes("arrisa-tok-kw-flow")) found = true
            }
        }
        expect(found).toBe(true)
    })
})
