import {describe, expect, it} from "vitest"
import {Leaf, Plot, Schema} from "@arrisa/doc"
import {EditorState} from "@arrisa/state"
import {composeKeymap} from "./compose-keymap"
import {KeyBinding} from "./key-map"

function makeDoc(text = "hello") {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph])
    return {
        schema,
        doc: schema.doc([paragraph.create([Leaf.text(text)])]),
        elements: schema.elements,
    }
}

function makeState(extensions: EditorState.Extension) {
    let {doc, elements} = makeDoc()
    return EditorState.create({
        doc,
        config: [EditorState.schemaElement.of(elements), extensions],
    })
}

describe("composeKeymap", () => {
    it("disables the default keymap and omits page motion", () => {
        let state = makeState(composeKeymap())
        expect(state.facet(KeyBinding.useDefaultKeymap)).toBe(false)
        let keys = state.facet(KeyBinding.source).map((b) => b.spec.key)
        expect(keys).toContain("Enter")
        expect(keys).toContain("Backspace")
        expect(keys).not.toContain("PageDown")
        expect(keys).not.toContain("PageUp")
    })

    it("includes Escape with allowDefault", () => {
        let state = makeState(composeKeymap())
        let escape = state.facet(KeyBinding.source).find((b) => b.spec.key == "Escape")
        expect(escape).toBeTruthy()
        expect(escape!.spec.allowDefault).toBe(true)
    })
})
