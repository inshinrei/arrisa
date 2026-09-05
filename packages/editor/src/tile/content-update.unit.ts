import {describe, expect, it} from "vitest"
import {Attributes, Elt, Plot, Schema} from "@arrisa/doc"
import {Widget} from "../decoration/widget"
import type {CompositionInfo} from "../input/composition"
import {ContentUpdate, separateComposition} from "./content-update"
import {TileFlag} from "./flag"
import {EltTile, WidgetTile} from "./leaves"

function comp(fromB: number, toB: number, text = "x"): CompositionInfo {
    return {fromB, toB, text, target: null as any, wrapCursor: null}
}

function mockEl(tag: string): any {
    return {
        nodeType: 1,
        nodeName: tag.toUpperCase(),
        tagName: tag.toUpperCase(),
        contentEditable: "inherit",
        childNodes: [] as any[],
    }
}

function withMockDocument(run: () => void) {
    let prev = (globalThis as any).document
    ;(globalThis as any).document = {
        createElement(name: string) {
            return mockEl(name)
        },
    }
    try {
        run()
    } finally {
        ;(globalThis as any).document = prev
    }
}

describe("separateComposition", () => {
    it("splits a keep section around the composition range", () => {
        // keep 10 covering posB 0..10; composition 3..7 with text "hi"
        let result = separateComposition([10, -1], comp(3, 7, "hi"))
        expect(result).toEqual([3, -1, 2, 2, 3, -1])
    })

    it("returns null when an insert only partially overlaps the composition", () => {
        // insert covers 0..3, composition 2..5 overhangs
        expect(separateComposition([0, 3], comp(2, 5))).toBe(null)
    })

    it("returns null when insert starts before fromB and ends inside composition", () => {
        expect(separateComposition([0, 5], comp(3, 8))).toBe(null)
    })

    it("rewrites a full insert that exactly covers the composition", () => {
        // replace 4 with 4 at posB 0..4, composition covers whole insert
        let result = separateComposition([4, 4], comp(0, 4, "abcd"))
        expect(result).toEqual([4, 4])
    })

    it("accepts an insert fully covered by the composition range", () => {
        // Insert sections must lie inside [fromB, toB]; composition owns the insert.
        // keep 2, then insert 3 at posB 2..5; composition 2..5 with text "abc"
        let result = separateComposition([2, -1, 0, 3], comp(2, 5, "abc"))
        expect(result).toEqual([2, -1, 0, 3])
    })

    it("returns null when composition is strictly inside a larger insert", () => {
        // Algorithm requires insert ⊆ composition for ins >= 0 sections.
        expect(separateComposition([0, 6], comp(1, 4, "xyz"))).toBe(null)
    })

    it("leaves non-overlapping prefix sections and still rewrites result[0] when composition is past end", () => {
        // Documented edge: when composition falls after all sections, `done` stays false and
        // result[lenI] (0) is overwritten with text.length + dLen.
        let result = separateComposition([4, -1, 2, -1], comp(10, 12, "z"))
        expect(result).toEqual([1, -1, 2, -1])
    })

    it("handles composition at the start of a keep", () => {
        let result = separateComposition([5, -1], comp(0, 2, "ab"))
        expect(result).toEqual([2, 2, 3, -1])
    })

    it("handles composition at the end of a keep", () => {
        let result = separateComposition([5, -1], comp(3, 5, "xy"))
        expect(result).toEqual([3, -1, 2, 2])
    })
})

describe("ContentUpdate.addBR", () => {
    it("skips trailing point decorations when deciding a textblock needs a BR", () => {
        withMockDocument(() => {
            let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
            let docType = Plot.defineDoc({blockContent: paragraph})
            Schema.define([docType, paragraph])
            let emptyPara = paragraph.create([])
            let block = EltTile.of(
                Elt.create("p", Attributes.none, Elt.hole),
                emptyPara,
                TileFlag.None,
                2,
                mockEl("p"),
            )
            let placeholder = Widget.create({render: () => mockEl("arrisa-placeholder")})
            block.addChild(new WidgetTile(placeholder, null, TileFlag.Point | TileFlag.PointAfter, 0))

            // Without skipping points, last would be the placeholder and no BR would be added.
            let cu = Object.create(ContentUpdate.prototype) as ContentUpdate
            cu.new = block as any
            cu.addBR()

            expect(block.children.length).toBe(2)
            expect(block.children[0]).toBeInstanceOf(WidgetTile)
            expect(block.children[0].dom.nodeName).toBe("ARRISA-PLACEHOLDER")
            expect(block.children[1]).toBeInstanceOf(WidgetTile)
            expect(block.children[1].dom.nodeName).toBe("BR")
        })
    })
})
