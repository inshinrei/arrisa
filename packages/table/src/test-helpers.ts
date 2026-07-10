/**
 * Test fixtures for `@arrisa/table` unit tests (not public API).
 */
import {type Command} from "@arrisa/command"
import {Leaf, Mark, Schema, type Plot} from "@arrisa/doc"
import {EditorSelection, EditorState, type Transaction} from "@arrisa/state"
import {Cell, ColSpan, Doc, HeaderCell, RowSpan, Table, TableRow} from "@arrisa/types"
import {CellSelection} from "./cell-selection"
import {tableCorrection} from "./correct"
import {TableMap} from "./table-map"

export type TableFixture = {
    schema: Schema
    state: EditorState
    doc: Plot.Doc
    /** Document position of the table content start (after table open). */
    tableStart: number
    map: TableMap
}

/** Schema with Doc, Table, TableRow, Cell, HeaderCell, ColSpan, RowSpan. */
export function tableSchema() {
    return Schema.define([Doc, Table, TableRow, Cell, HeaderCell, ColSpan, RowSpan])
}

/** Empty (or text-filled) inline cell, optional col/row span marks. */
export function makeCell(
    text = "",
    opts: {colSpan?: number; rowSpan?: number; header?: boolean} = {},
) {
    let content = text ? [Leaf.text(text)] : []
    let marks = Mark.none
    if (opts.colSpan && opts.colSpan > 1) marks = ColSpan.of(opts.colSpan).addToSet(marks)
    if (opts.rowSpan && opts.rowSpan > 1) marks = RowSpan.of(opts.rowSpan).addToSet(marks)
    let tag = opts.header ? HeaderCell : Cell
    return tag.create(content).withMarks(marks)
}

/**
 * Build a rectangular table.
 * `cells[row][col]` is the origin cell for that grid slot; use `null` for
 * positions covered by a previous span (not emitted as children).
 */
export function makeTable(cells: (Plot | null)[][]) {
    let rows: Plot[] = []
    for (let row of cells) {
        let content: Plot[] = []
        for (let cell of row) if (cell) content.push(cell)
        rows.push(TableRow.create(content))
    }
    return Table.create(rows)
}

/** Simple rows×cols grid of labeled empty-or-text cells. */
export function grid(rows: number, cols: number, text = true) {
    let cells: Plot[][] = []
    for (let r = 0; r < rows; r++) {
        let row: Plot[] = []
        for (let c = 0; c < cols; c++) row.push(makeCell(text ? `${r},${c}` : ""))
        cells.push(row)
    }
    return makeTable(cells)
}

/**
 * Editor state with a single table as the only doc block.
 * Table content starts at position 1 in this layout.
 */
export function stateWithTable(
    table: Plot,
    opts: {
        selection?: number | EditorSelection
        extensions?: EditorState.Extension
    } = {},
): TableFixture {
    let schema = tableSchema()
    let doc = schema.doc([table])
    let tableStart = 1
    let map = TableMap.get(table, tableStart)
    let selection: EditorSelection
    if (opts.selection instanceof EditorSelection) selection = opts.selection
    else if (typeof opts.selection == "number") selection = EditorSelection.cursor(opts.selection)
    else selection = EditorSelection.cursor(map.cellAt(0, 0)! + 1)

    let state = EditorState.create({
        doc,
        selection,
        config: [
            EditorState.schemaElement.of(schema.elements),
            CellSelection.extension,
            ...(opts.extensions ? [opts.extensions] : []),
        ],
    })
    let liveTable = state.doc.firstChild as Plot
    map = TableMap.get(liveTable, tableStart)
    return {schema, state, doc: state.doc, tableStart, map}
}

export function stateFromGrid(rows: number, cols: number, opts?: Parameters<typeof stateWithTable>[1]) {
    return stateWithTable(grid(rows, cols), opts)
}

/** Document position of the cell open at (col, row). */
export function cellPos(fixture: TableFixture, col: number, row: number) {
    let pos = fixture.map.cellAt(col, row)
    if (pos == null) throw new Error(`No cell at ${col},${row}`)
    return pos
}

/** Select a rectangular cell range from (c1,r1) to (c2,r2) inclusive. */
export function selectCells(fixture: TableFixture, c1: number, r1: number, c2: number, r2: number): TableFixture {
    let a = cellPos(fixture, c1, r1)
    let b = cellPos(fixture, c2, r2)
    let endB = fixture.map.cellEnd(b)
    let sel = CellSelection.between(fixture.state.doc, a, endB)
    if (!sel) throw new Error("Could not create CellSelection")
    let state = fixture.state.update({selection: sel}).state
    let liveTable = state.doc.firstChild as Plot
    let map = TableMap.get(liveTable, fixture.tableStart)
    return {schema: fixture.schema, state, doc: state.doc, tableStart: fixture.tableStart, map}
}

export function apply(state: EditorState, spec: Transaction.Spec) {
    return state.update(spec).state
}

export function runPure<Param = null>(
    state: EditorState,
    cmd: Command.Pure<Param>,
    ...args: Param extends null ? [] : [Param]
) {
    let param = (args.length ? args[0] : null) as Param
    let spec = cmd({state}, param)
    if (!spec) return {state, applied: false as const, spec: false as const}
    return {state: apply(state, spec), applied: true as const, spec}
}

/** Refresh map after a transaction from the fixture’s table start. */
export function refreshMap(state: EditorState, tableStart = 1) {
    let table = state.doc.firstChild as Plot
    return TableMap.get(table, tableStart)
}

export function withCorrection(table: Plot) {
    return stateWithTable(table, {extensions: tableCorrection})
}
