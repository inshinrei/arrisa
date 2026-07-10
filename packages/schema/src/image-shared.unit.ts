import {describe, expect, it} from "vitest"
import {Leaf} from "@arrisa/doc"
import {EditorSelection} from "@arrisa/state"
import {CaptionedFigure, Figure, Image, Paragraph} from "@arrisa/types"
import {blockDoc, paragraph} from "./block"
import {figure, image} from "./image"
import {activeImage} from "./image-shared"
import {makeState} from "./test-helpers"

describe("activeImage", () => {
    it("returns null for a text cursor in a paragraph", () => {
        let state = makeState([blockDoc(), paragraph(), image()], {selection: 1})
        expect(activeImage(state.sel)).toBeNull()
    })

    it("returns the tag for a node selection on an inline Image", () => {
        let state = makeState([blockDoc(), paragraph(), image()])
        let img = Image.of("https://example.com/a.png")
        let doc = state.schema.doc([Paragraph.create([img])])
        // open + image leaf: node at pos 1
        let node = doc.nodeAt(1) as Leaf
        expect(node.type).toBe(Image)
        state = makeState([blockDoc(), paragraph(), image()], {
            doc,
            selection: EditorSelection.node(1, node),
        })
        let tag = activeImage(state.sel)
        expect(tag).toBeTruthy()
        expect(tag!.eq(img)).toBe(true)
    })

    it("returns the tag for a node selection on a Figure", () => {
        let state = makeState([blockDoc(), paragraph(), figure()])
        let fig = Figure.of("https://example.com/b.png")
        let doc = state.schema.doc([fig])
        let node = doc.nodeAt(0) as Leaf
        expect(node.type).toBe(Figure)
        state = makeState([blockDoc(), paragraph(), figure()], {
            doc,
            selection: EditorSelection.node(0, node),
        })
        let tag = activeImage(state.sel)
        expect(tag).toBeTruthy()
        expect(tag!.eq(fig)).toBe(true)
    })

    it("returns the tag when the cursor is inside a CaptionedFigure", () => {
        let state = makeState([blockDoc(), paragraph(), figure({captioned: true})])
        let cap = CaptionedFigure.of("https://example.com/c.png").create([Leaf.text("cap")])
        let doc = state.schema.doc([cap])
        // position inside caption text
        state = makeState([blockDoc(), paragraph(), figure({captioned: true})], {
            doc,
            selection: 1,
        })
        expect(state.sel.head.parent.node.type).toBe(CaptionedFigure)
        let tag = activeImage(state.sel)
        expect(tag).toBeTruthy()
        expect(tag!.type).toBe(CaptionedFigure)
    })
})
