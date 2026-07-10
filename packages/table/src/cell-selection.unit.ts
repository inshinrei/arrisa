import {describe, expect, it} from "vitest"
import {EditorSelection} from "@arrisa/state"
import {CellSelection} from "./cell-selection"
import {cellPos, selectCells, stateFromGrid} from "./test-helpers"

describe("CellSelection", () => {
    it("between creates a multi-cell selection", () => {
        let fx = stateFromGrid(2, 2)
        let a = cellPos(fx, 0, 0)
        let b = cellPos(fx, 1, 0)
        let sel = CellSelection.between(fx.doc, a, fx.map.cellEnd(b))
        expect(sel).not.toBe(null)
        expect(sel!.ranges).toHaveLength(2)
        expect(sel!.anchorCell).toBe(a)
    })

    it("between returns null for a collapsed range", () => {
        let fx = stateFromGrid(2, 2)
        let a = cellPos(fx, 0, 0)
        expect(CellSelection.between(fx.doc, a, a)).toBe(null)
    })

    it("normalize expands a range that covers multiple cells into CellSelection", () => {
        let fx = stateFromGrid(2, 2)
        let from = cellPos(fx, 0, 0)
        let to = fx.map.cellEnd(cellPos(fx, 1, 0))
        let textSel = EditorSelection.range(from + 1, to - 1)
        let normalized = CellSelection.normalize(textSel, fx.doc)
        expect(normalized).toBeInstanceOf(CellSelection)
        expect((normalized as CellSelection).ranges.length).toBeGreaterThanOrEqual(2)
    })

    it("normalize returns null for a pure CellSelection", () => {
        let fx = selectCells(stateFromGrid(2, 2), 0, 0, 1, 0)
        expect(CellSelection.normalize(fx.state.selection, fx.doc)).toBe(null)
    })

    it("moveHead walks the grid", () => {
        let fx = selectCells(stateFromGrid(2, 2), 0, 0, 0, 0)
        // single cell selection needs two positions — use full cell
        let a = cellPos(fx, 0, 0)
        let sel = CellSelection.between(fx.doc, a, fx.map.cellEnd(a))
        // between with same cell: anchor at open, head at end — ranges length 1
        // Actually same cell: from and to cells are the same node
        // between(a, cellEnd(a)): from=a nodeAfter=cell, to=end nodeBefore=cell
        expect(sel).not.toBe(null)
        let right = sel!.moveHead(fx.doc, "forward")
        expect(right).not.toBe(null)
        expect(right!.headCell).toBe(cellPos(fx, 1, 0))
        let down = sel!.moveHead(fx.doc, "down")
        expect(down).not.toBe(null)
        expect(down!.headCell).toBe(cellPos(fx, 0, 1))
        expect(sel!.moveHead(fx.doc, "backward")).toBe(null)
        expect(sel!.moveHead(fx.doc, "up")).toBe(null)
    })

    it("eq compares anchor and head", () => {
        let fx = selectCells(stateFromGrid(2, 2), 0, 0, 1, 0)
        let sel = fx.state.selection as CellSelection
        expect(sel.eq(sel)).toBe(true)
        let other = selectCells(stateFromGrid(2, 2), 0, 0, 0, 1).state.selection
        expect(sel.eq(other)).toBe(false)
    })
})
