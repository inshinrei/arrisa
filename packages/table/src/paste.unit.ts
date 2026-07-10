import {describe, expect, it} from "vitest"
import {Leaf, Slice} from "@arrisa/doc"
import {Cell, Table, TableRow} from "@arrisa/types"
import {handleTablePaste} from "./paste"
import {makeCell, makeTable, refreshMap, selectCells, stateFromGrid, stateWithTable} from "./test-helpers"

function tableSlice(rows: string[][]) {
    let rowNodes = rows.map((row) => TableRow.create(row.map((t) => Cell.create(t ? [Leaf.text(t)] : []))))
    return Slice.of([Table.create(rowNodes)])
}

describe("handleTablePaste", () => {
    it("returns false for non-table content outside a cell selection", () => {
        let fx = stateFromGrid(2, 2)
        let slice = Slice.of([Leaf.text("hello")])
        expect(handleTablePaste(fx.state, slice, [])).toBe(false)
    })

    it("pastes a table into a cell selection, clipping to the selection", () => {
        let fx = selectCells(stateFromGrid(2, 2), 0, 0, 1, 0)
        let slice = tableSlice([
            ["X", "Y", "Z"],
            ["1", "2", "3"],
        ])
        let tr = handleTablePaste(fx.state, slice, [])
        expect(tr).not.toBe(false)
        if (tr === false) return
        expect(tr.userEvent).toBe("input.paste")
        let state = fx.state.update(tr).state
        let map = refreshMap(state)
        expect(map.width).toBe(2)
        expect(map.height).toBe(2)
        // First row cells should have been replaced (text content)
        let c0 = map.getCell(map.cellAt(0, 0)!)
        expect(c0.textContent()).toContain("X")
    })

    it("pastes table cells starting at the cursor cell", () => {
        let fx = stateFromGrid(2, 2)
        // cursor inside first cell — not a CellSelection
        let slice = tableSlice([["P", "Q"]])
        let tr = handleTablePaste(fx.state, slice, [])
        expect(tr).not.toBe(false)
        if (tr === false) return
        expect(tr.userEvent).toBe("input.paste")
        let next = fx.state.update(tr).state
        let map = refreshMap(next)
        expect(map.getCell(map.cellAt(0, 0)!).textContent()).toContain("P")
        expect(map.getCell(map.cellAt(1, 0)!).textContent()).toContain("Q")
    })

    it("grows the table when pasting a larger block at the cursor", () => {
        let fx = stateWithTable(makeTable([[makeCell("a")]]))
        let slice = tableSlice([
            ["1", "2"],
            ["3", "4"],
        ])
        let tr = handleTablePaste(fx.state, slice, [])
        expect(tr).not.toBe(false)
        if (tr === false) return
        let map = refreshMap(fx.state.update(tr).state)
        expect(map.width).toBe(2)
        expect(map.height).toBe(2)
    })

    it("tags drop inserts with input.drop", () => {
        let fx = stateFromGrid(2, 2)
        let dropPos = fx.map.cellAt(0, 0)! + 1
        let slice = tableSlice([["D"]])
        let tr = handleTablePaste(fx.state, slice, [], dropPos)
        expect(tr).not.toBe(false)
        if (tr === false) return
        expect(tr.userEvent).toBe("input.drop")
    })
})
