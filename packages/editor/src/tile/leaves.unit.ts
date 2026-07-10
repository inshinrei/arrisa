import {describe, expect, it} from "vitest"
import {Attributes, Elt} from "@arrisa/doc"
import {EltTile, TextTile, noChildren} from "./leaves"
import {TileFlag} from "./flag"

function mockDom(): Element {
    return {nodeType: 1, arrisaTile: undefined} as any
}

describe("EltTile.of", () => {
    it("sets HasContent when the shape has a content hole", () => {
        let elt = Elt.create("div", Attributes.none, Elt.hole)
        let tile = EltTile.of(elt, null, TileFlag.None, 0, mockDom())
        expect(tile.flags & TileFlag.HasContent).toBeTruthy()
        expect(tile.flags & TileFlag.ContentNotLast).toBeFalsy()
    })

    it("sets ContentNotLast when hole is not the last child", () => {
        // Content hole is the literal `0`, not nested Elt.hole array.
        let elt = Elt.create("div", Attributes.none, [0, "tail"])
        let tile = EltTile.of(elt, null, TileFlag.None, 0, mockDom())
        expect(tile.flags & TileFlag.HasContent).toBeTruthy()
        expect(tile.flags & TileFlag.ContentNotLast).toBeTruthy()
    })

    it("reports node outer and atom from node + flags", () => {
        let elt = Elt.create("img", Attributes.none, [])
        let node = {isLeaf: true} as any
        let tile = EltTile.of(elt, node, TileFlag.Atom, 1, mockDom())
        expect(tile.isNodeOuter).toBe(true)
        expect(tile.isAtom).toBe(true)
        expect(tile.boundary).toBe(0)
    })
})

describe("TextTile", () => {
    it("tracks text length and leaf flags", () => {
        let dom = {nodeType: 3, nodeValue: "hi", arrisaTile: undefined} as any as Text
        let tile = new TextTile("hi", dom)
        expect(tile.length).toBe(2)
        expect(tile.isText).toBe(true)
        expect(tile.isAtom).toBe(true)
        expect(tile.isNodeOuter).toBe(true)
        expect(tile.children).toBe(noChildren)
        expect(tile.toString()).toBe(JSON.stringify("hi"))
    })

    it("sync updates the text node value once", () => {
        let dom = {nodeType: 3, nodeValue: "old", arrisaTile: undefined} as any as Text
        let tile = new TextTile("new", dom)
        tile.sync()
        expect(dom.nodeValue).toBe("new")
        expect(tile.flags & TileFlag.Synced).toBeTruthy()
        dom.nodeValue = "tampered"
        tile.sync()
        expect(dom.nodeValue).toBe("tampered")
    })
})
