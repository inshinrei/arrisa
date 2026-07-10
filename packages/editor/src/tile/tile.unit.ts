import {describe, expect, it} from "vitest"
import {EditorState, TextblockMap} from "@arrisa/state"
import {CompositeTile, Orientation, rowScan} from "./tile"
import {TileFlag} from "./flag"
import {CoordPos} from "./pos"

function rect(left: number, top: number, right: number, bottom: number): DOMRect {
    return {left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({})} as DOMRect
}

/** Minimal composite tile for structural tests (no real DOM sync). */
class TestTile extends CompositeTile {
    constructor(dom: Element, length = 0, flags: number = TileFlag.None) {
        super(dom, flags)
        this.length = length
    }

    posAtCoordsInner(
        start: number,
        _state: EditorState,
        _x: number,
        _y: number,
        _textblock: TextblockMap | null,
        _orientation: Orientation,
    ): CoordPos {
        return CoordPos.create(start, 1)
    }
}

function mockDom(box: DOMRect, nodeType = 1): Element {
    return {
        nodeType,
        getBoundingClientRect: () => box,
        getClientRects: () => [box] as any,
        firstChild: null,
        arrisaTile: undefined,
    } as any
}

describe("rowScan", () => {
    it("returns null when the scan yields no rects", () => {
        expect(rowScan(0, 0, () => {})).toBe(null)
    })

    it("picks the rect containing the point", () => {
        let result = rowScan<string>(15, 10, (add) => {
            add(rect(0, 0, 10, 20), "left")
            add(rect(12, 0, 30, 20), "right")
        })
        expect(result!.closest).toBe("right")
    })

    it("chooses the horizontally closest band at the same y", () => {
        let result = rowScan<string>(50, 10, (add) => {
            add(rect(0, 0, 10, 20), "far")
            add(rect(40, 0, 45, 20), "near")
        })
        expect(result!.closest).toBe("near")
    })

    it("returns null when only vertical neighbors exist and recursion cannot hit", () => {
        // Single band entirely above y with no horizontal candidate at that band.
        let calls = 0
        let result = rowScan(5, 100, (add) => {
            calls++
            if (calls > 5) return
            add(rect(0, 0, 10, 10), "above")
        })
        // side midpoint restart should eventually land inside the band
        expect(result!.closest).toBe("above")
    })
})

describe("posBeforeChild", () => {
    it("sums preceding sibling lengths", () => {
        let parent = new TestTile(mockDom(rect(0, 0, 1, 1)), 0)
        let a = new TestTile(mockDom(rect(0, 0, 1, 1)), 3)
        let b = new TestTile(mockDom(rect(0, 0, 1, 1)), 5)
        parent.children = [a, b]
        a.parent = parent
        b.parent = parent
        expect(parent.posBeforeChild(a, 10)).toBe(10)
        expect(parent.posBeforeChild(b, 10)).toBe(13)
    })

    it("throws when the child is not present", () => {
        let parent = new TestTile(mockDom(rect(0, 0, 1, 1)))
        let orphan = new TestTile(mockDom(rect(0, 0, 1, 1)))
        expect(() => parent.posBeforeChild(orphan)).toThrow(/Child not found/)
    })
})

describe("posAtCoordsCol", () => {
    it("uses lastBot when associating a gap between children", () => {
        let parent = new TestTile(mockDom(rect(0, 0, 100, 100)), 10)
        let upper = new TestTile(mockDom(rect(0, 0, 100, 20)), 4)
        let lower = new TestTile(mockDom(rect(0, 40, 100, 60)), 6)
        parent.children = [upper, lower]
        upper.parent = parent
        lower.parent = parent

        // y in the gap, closer to lower → side 1 at lower's start
        let closerLower = parent.posAtCoordsCol(0, null as any, 10, 35, null)
        expect(closerLower.pos).toBe(4)
        expect(closerLower.side).toBe(1)

        // y in the gap, closer to upper → side -1
        let closerUpper = parent.posAtCoordsCol(0, null as any, 10, 25, null)
        expect(closerUpper.pos).toBe(4)
        expect(closerUpper.side).toBe(-1)
    })

    it("descends into a child whose vertical span covers y", () => {
        let parent = new TestTile(mockDom(rect(0, 0, 100, 100)), 4)
        let child = new TestTile(mockDom(rect(0, 10, 100, 30)), 4)
        parent.children = [child]
        child.parent = parent
        let hit = parent.posAtCoordsCol(2, null as any, 5, 20, null)
        // child.posAtCoordsInner returns start = parentStart + boundary
        expect(hit.pos).toBe(2)
    })
})

describe("Tile.nearestNode", () => {
    it("walks up until a tile with a node is found", () => {
        let root = new TestTile(mockDom(rect(0, 0, 1, 1)))
        Object.defineProperty(root, "node", {get: () => ({})})
        let mid = new TestTile(mockDom(rect(0, 0, 1, 1)))
        mid.parent = root
        let leaf = new TestTile(mockDom(rect(0, 0, 1, 1)))
        leaf.parent = mid
        expect(leaf.nearestNode()).toBe(root)
    })
})
