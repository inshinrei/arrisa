import {describe, expect, it} from "vitest"
import {ColSpan, RowSpan} from "@arrisa/types"
import {makeCell, makeTable, stateFromGrid, stateWithTable} from "./test-helpers"
import {Rect, TableMap} from "./table-map"

describe("TableMap", () => {
    it("maps a simple 2×3 grid", () => {
        let {map} = stateFromGrid(2, 3)
        expect(map.width).toBe(3)
        expect(map.height).toBe(2)
        expect(map.problems).toBe(null)
        let c00 = map.cellAt(0, 0)!
        let c20 = map.cellAt(2, 0)!
        let c01 = map.cellAt(0, 1)!
        expect(c00).toBeLessThan(c20)
        expect(c00).toBeLessThan(c01)
        expect(map.cellRect(c00)).toEqual(new Rect(0, 0, 1, 1))
    })

    it("computes rectBetween and cellsInRect", () => {
        let {map} = stateFromGrid(3, 3)
        let a = map.cellAt(0, 0)!,
            b = map.cellAt(2, 1)!
        let rect = map.rectBetween(a, b)
        expect(rect).toEqual(new Rect(0, 0, 3, 2))
        let cells = map.cellsInRect(rect)
        expect(cells).toHaveLength(6)
        expect(cells[0]).toBe(a)
    })

    it("tracks colSpan across columns", () => {
        let table = makeTable([
            [makeCell("a", {colSpan: 2}), null, makeCell("b")],
            [makeCell("c"), makeCell("d"), makeCell("e")],
        ])
        let {map} = stateWithTable(table)
        expect(map.width).toBe(3)
        expect(map.height).toBe(2)
        expect(map.problems).toBe(null)
        let origin = map.cellAt(0, 0)!
        expect(map.cellAt(1, 0)).toBe(origin)
        expect(map.cellRect(origin)).toEqual(new Rect(0, 0, 2, 1))
        expect(map.getCell(origin).mark(ColSpan)).toBe(2)
    })

    it("tracks rowSpan across rows", () => {
        let table = makeTable([
            [makeCell("a", {rowSpan: 2}), makeCell("b")],
            [null, makeCell("c")],
        ])
        let {map} = stateWithTable(table)
        expect(map.width).toBe(2)
        expect(map.height).toBe(2)
        let origin = map.cellAt(0, 0)!
        expect(map.cellAt(0, 1)).toBe(origin)
        expect(map.cellRect(origin)).toEqual(new Rect(0, 0, 1, 2))
        expect(map.getCell(origin).mark(RowSpan)).toBe(2)
    })

    it("reports missing cells and returns null from cellAt for empty slots", () => {
        // One row shorter than the other → missing slots on the short row
        let table = makeTable([
            [makeCell("a"), makeCell("b")],
            [makeCell("c")],
        ])
        let map = TableMap.get(table, 1)
        expect(map.problems).not.toBe(null)
        expect(map.problems!.some((p) => p.type == "missing")).toBe(true)
        expect(map.cellAt(0, 1)).not.toBe(null)
        expect(map.cellAt(1, 1)).toBe(null)
    })

    it("reports overlong rowspan", () => {
        let table = makeTable([[makeCell("a", {rowSpan: 3})], [makeCell("b")]])
        let map = TableMap.get(table, 1)
        expect(map.problems).not.toBe(null)
        expect(map.problems!.some((p) => p.type == "overlong_rowspan")).toBe(true)
    })

    it("detects rectangle overlap for merge safety", () => {
        let table = makeTable([
            [makeCell("a", {colSpan: 2}), null],
            [makeCell("b"), makeCell("c")],
        ])
        let {map} = stateWithTable(table)
        // Selecting only the bottom-left and bottom-right is clean
        expect(map.cellsOverlapRectangle(new Rect(0, 1, 2, 2))).toBe(false)
        // Selecting top-right unit that is covered by colspan from left overlaps
        expect(map.cellsOverlapRectangle(new Rect(1, 0, 2, 1))).toBe(true)
    })

    it("cellInsertionPos and rowPos are ordered", () => {
        let {map} = stateFromGrid(2, 2)
        expect(map.rowPos(0)).toBeLessThan(map.rowPos(1))
        expect(map.cellInsertionPos(0, 0)).toBe(map.cellAt(0, 0))
        expect(map.cellInsertionPos(2, 0)).toBeGreaterThan(map.cellAt(1, 0)!)
    })
})
