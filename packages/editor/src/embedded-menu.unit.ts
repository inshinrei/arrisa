import {describe, expect, it} from "vitest"
import {Leaf, Plot, Schema} from "@arrisa/doc"
import {EditorState} from "@arrisa/state"
import {embeddedMenu} from "./embedded-menu"
import {editorPlugin} from "./editor/plugin-api"
import {Arrisa} from "./editor"

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

describe("embeddedMenu", () => {
    it("registers a plugin and default top template", () => {
        let parent = {appendChild() {}, children: []} as any
        let state = makeState(embeddedMenu({parent}))
        expect(state.facet(editorPlugin).length).toBeGreaterThan(0)
    })

    it("omits default theme when theme is false", () => {
        let parent = {} as HTMLElement
        let withTheme = makeState(embeddedMenu({parent, theme: true}))
        let noTheme = makeState(embeddedMenu({parent, theme: false}))
        expect(noTheme.facet(Arrisa.styleModule).length).toBeLessThan(withTheme.facet(Arrisa.styleModule).length)
    })
})
