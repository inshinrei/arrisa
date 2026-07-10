import {describe, expect, it} from "vitest"
import {EditorSelection} from "@arrisa/state"
import {ColSpan, HeaderCell, RowSpan} from "@arrisa/types"
import {
    addColumn,
    addRow,
    deleteColumn,
    deleteRow,
    mergeCells,
    splitCell,
    toggleHeaderCell,
} from "./commands"
import {CellSelection} from "./cell-selection"
import {
    makeCell,
    makeTable,
    refreshMap,
    runPure,
    selectCells,
    stateFromGrid,
    stateWithTable,
} from "./test-helpers"

function selectOne(fx: ReturnType<typeof stateFromGrid>, col: number, row: number) {
    let a = fx.map.cellAt(col, row)!
    let sel = CellSelection.between(fx.doc, a, fx.map.cellEnd(a))!
    return fx.state.update({selection: sel}).state
}

describe("table commands", () => {
    it("addColumn after increases width", () => {
        let fx = stateFromGrid(2, 2)
        let result = runPure(selectOne(fx, 0, 0), addColumn, "after")
        expect(result.applied).toBe(true)
        expect(refreshMap(result.state).width).toBe(3)
        expect(refreshMap(result.state).height).toBe(2)
    })

    it("addColumn before inserts at the left", () => {
        let fx = stateFromGrid(1, 2)
        let result = runPure(selectOne(fx, 0, 0), addColumn, "before")
        expect(result.applied).toBe(true)
        expect(refreshMap(result.state).width).toBe(3)
    })

    it("addRow after increases height", () => {
        let fx = stateFromGrid(2, 2)
        let result = runPure(selectOne(fx, 0, 0), addRow, "after")
        expect(result.applied).toBe(true)
        expect(refreshMap(result.state).height).toBe(3)
    })

    it("deleteColumn removes a column", () => {
        let fx = stateFromGrid(2, 3)
        let result = runPure(selectOne(fx, 1, 0), deleteColumn)
        expect(result.applied).toBe(true)
        expect(refreshMap(result.state).width).toBe(2)
    })

    it("deleteColumn on all columns issues a table delete", () => {
        let fx = selectCells(stateFromGrid(1, 2), 0, 0, 1, 0)
        let before = fx.state.doc.length
        let result = runPure(fx.state, deleteColumn)
        expect(result.applied).toBe(true)
        expect(result.spec !== false && (result.spec as {userEvent?: string}).userEvent).toBe("delete.table")
        // fit may leave a minimal placeholder; document should still shrink
        expect(result.state.doc.length).toBeLessThan(before)
    })

    it("deleteRow removes a row", () => {
        let fx = stateFromGrid(3, 2)
        let result = runPure(selectOne(fx, 0, 1), deleteRow)
        expect(result.applied).toBe(true)
        expect(refreshMap(result.state).height).toBe(2)
    })

    it("mergeCells joins a 2×2 block", () => {
        let fx = selectCells(stateFromGrid(2, 2), 0, 0, 1, 1)
        let result = runPure(fx.state, mergeCells)
        expect(result.applied).toBe(true)
        let map = refreshMap(result.state)
        expect(map.width).toBe(2)
        expect(map.height).toBe(2)
        let origin = map.cellAt(0, 0)!
        expect(map.cellAt(1, 0)).toBe(origin)
        expect(map.cellAt(0, 1)).toBe(origin)
        expect(map.getCell(origin).mark(ColSpan)).toBe(2)
        expect(map.getCell(origin).mark(RowSpan)).toBe(2)
    })

    it("mergeCells returns false for a single cell", () => {
        let fx = stateFromGrid(2, 2)
        expect(runPure(selectOne(fx, 0, 0), mergeCells).applied).toBe(false)
    })

    it("splitCell undoes a colspan", () => {
        let table = makeTable([
            [makeCell("ab", {colSpan: 2}), null],
            [makeCell("c"), makeCell("d")],
        ])
        let fx = stateWithTable(table)
        let result = runPure(selectOne(fx, 0, 0), splitCell)
        expect(result.applied).toBe(true)
        let map = refreshMap(result.state)
        expect(map.cellAt(0, 0)).not.toBe(map.cellAt(1, 0))
        expect(map.getCell(map.cellAt(0, 0)!).mark(ColSpan)).toBeUndefined()
    })

    it("toggleHeaderCell converts cell types", () => {
        let fx = stateFromGrid(1, 1)
        let result = runPure(selectOne(fx, 0, 0), toggleHeaderCell)
        expect(result.applied).toBe(true)
        let map = refreshMap(result.state)
        expect(map.getCell(map.cellAt(0, 0)!).type).toBe(HeaderCell.type)

        let a2 = map.cellAt(0, 0)!
        let state2 = result.state.update({
            selection: CellSelection.between(result.state.doc, a2, map.cellEnd(a2))!,
        }).state
        let back = runPure(state2, toggleHeaderCell)
        expect(back.applied).toBe(true)
        expect(refreshMap(back.state).getCell(refreshMap(back.state).cellAt(0, 0)!).type.name).toBe("Cell")
    })

    it("returns false outside a table", () => {
        let fx = stateFromGrid(1, 1)
        let state = fx.state.update({selection: EditorSelection.cursor(0)}).state
        expect(runPure(state, addRow, "after").applied).toBe(false)
        expect(runPure(state, deleteColumn).applied).toBe(false)
    })
})
