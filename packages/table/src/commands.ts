/**
 * Pure structure commands for tables: rows, columns, merge/split, header toggle.
 *
 * All commands are {@link Command.Pure} — they only need `{state}` and return a
 * transaction spec or `false`. Depends on {@link context} and {@link CellSelection};
 * does not import menu or paste modules.
 */
import {type Command} from "@arrisa/command"
import {type ChangeSet, type Node} from "@arrisa/doc"
import {EditorSelection, type EditorState} from "@arrisa/state"
import {ColSpan, RowSpan, TableRow} from "@arrisa/types"
import {CellSelection} from "./cell-selection"
import {cellTag, headerCellTag, tableContext} from "./context"
import {type TableMap} from "./table-map"

function selectedRect(state: EditorState, cx: {cells: number[]; map: TableMap}) {
    return state.selection instanceof CellSelection
        ? cx.map.rectBetween(state.selection.anchorCell, state.selection.headCell)
        : cx.map.cellRect(cx.cells[0])
}

/**
 * Convert selected cells to/from header cells.
 * If any selected cell is not a header, those become headers; otherwise all
 * headers become regular cells.
 */
export const toggleHeaderCell: Command.Pure = ({state}) => {
    let cx = tableContext(state),
        header = headerCellTag(state.schema)
    if (!cx || !header) return false
    let cells = cx.cells.map((c) => cx.map.getCell(c))
    let changes: ChangeSet.Spec[] = []
    if (cells.some((x) => x.type != header.type)) {
        for (let i = 0; i < cells.length; i++) {
            let cell = cells[i],
                pos = cx.cells[i]
            if (cell.type != header.type)
                changes.push({from: pos, to: pos + 1, insert: [state.schema.withMarksFrom(cell.tag, header)]})
        }
    } else {
        let tag = cellTag(state.schema)
        for (let i = 0; i < cells.length; i++) {
            let cell = cells[i],
                pos = cx.cells[i]
            if (cell.type == header.type)
                changes.push({from: pos, to: pos + 1, insert: [state.schema.withMarksFrom(cell.tag, tag)]})
        }
    }
    return {changes}
}

/** Insert a column before (`"before"`) or after (`"after"`) the selection. */
export const addColumn: Command.Pure<"before" | "after"> = ({state}, side) => {
    let cx = tableContext(state)
    if (!cx) return false
    let {map} = cx,
        rect = selectedRect(state, cx)
    let col = side == "before" ? rect.startCol : rect.endCol

    let changes: ChangeSet.Spec[] = [],
        adjusted = new Set<number>()
    for (let row = 0, pos; row < map.height; row++) {
        if (col > 0 && col < map.width && map.cellAt(col - 1, row) == (pos = map.cellAt(col, row)) && pos != null) {
            if (!adjusted.has(pos)) {
                let value = map.getCell(pos).mark(ColSpan) ?? 1
                changes.push({from: pos, add: ColSpan.of(value + 1)})
                adjusted.add(pos)
            }
        } else {
            changes.push({
                from: map.cellInsertionPos(col, row),
                insert: [state.schema.createAndFill(cellTag(state.schema))],
            })
        }
    }
    return {
        changes,
        userEvent: "insert.column",
    }
}

/**
 * Delete columns covered by the selection.
 * If every column is selected, deletes the whole table.
 */
export const deleteColumn: Command.Pure = ({state}) => {
    let cx = tableContext(state)
    if (!cx) return false
    let {map} = cx,
        rect = selectedRect(state, cx)
    if (rect.startCol == 0 && rect.endCol == map.width) {
        return {
            changes: {from: map.tablePos, to: map.tablePos + map.table.length, fit: true},
            selection: (cx) => EditorSelection.near(cx, map.tablePos, -1),
            userEvent: "delete.table",
        }
    }

    let changes: ChangeSet.Spec[] = [],
        handled = new Set<number>(),
        delPos = state.selection.from
    for (let row = 0; row < map.height; row++) {
        for (let col = rect.startCol; col < rect.endCol; ) {
            let cell = map.cellAt(col, row)
            if (cell == null) {
                col++
                continue
            }
            let node = map.getCell(cell),
                span = node.mark(ColSpan) ?? 1
            if (col == rect.startCol && col > 0 && map.cellAt(col - 1, row) == cell) {
                let cellRect = map.cellRect(cell)
                if (!handled.has(cell)) {
                    let newSpan = rect.startCol - cellRect.startCol + Math.max(0, cellRect.endCol - rect.endCol)
                    changes.push(
                        newSpan == 1
                            ? {from: cell, remove: ColSpan.isInSet(node.marks)!}
                            : {from: cell, add: ColSpan.of(newSpan)},
                    )
                    handled.add(cell)
                }
                col = cellRect.endCol
            } else if (col + span > rect.endCol) {
                if (!handled.has(cell)) {
                    let newSpan = col + span - rect.endCol
                    changes.push(
                        newSpan == 1
                            ? {from: cell, remove: ColSpan.isInSet(node.marks)!}
                            : {from: cell, add: ColSpan.of(newSpan)},
                    )
                    handled.add(cell)
                }
                break
            } else {
                if (!handled.has(cell)) {
                    changes.push({from: cell, to: cell + node.length})
                    delPos = Math.min(delPos, cell)
                    handled.add(cell)
                }
                col += span
            }
        }
    }
    return {
        changes,
        selection: (cx) => EditorSelection.near(cx, delPos, -1),
        userEvent: "delete.column",
    }
}

/** Insert a row before (`"before"`) or after (`"after"`) the selection. */
export const addRow: Command.Pure<"before" | "after"> = ({state}, side) => {
    let cx = tableContext(state)
    if (!cx) return false
    let {map} = cx,
        rect = selectedRect(state, cx)
    let row = side == "before" ? rect.startRow : rect.endRow

    let changes: ChangeSet.Spec[] = [],
        adjusted = new Set<number>()
    let cellCount = map.width
    if (row > 0 && row < map.height) {
        for (let col = 0; col < map.width; col++) {
            let above = map.cellAt(col, row - 1),
                below = map.cellAt(col, row)
            if (above != null && above == below) {
                cellCount--
                if (!adjusted.has(above)) {
                    let value = map.getCell(above).mark(RowSpan)!
                    changes.push({from: above, add: RowSpan.of(value + 1)})
                    adjusted.add(above)
                }
            }
        }
    }
    let cell = state.schema.createAndFill(cellTag(state.schema)),
        content: Node[] = []
    for (let i = 0; i < cellCount; i++) content.push(cell)
    changes.push({from: map.rowPos(row), insert: [TableRow.create(content)]})

    return {
        changes,
        userEvent: "insert.row",
    }
}

/**
 * Delete rows covered by the selection.
 * If every row is selected, deletes the whole table.
 */
export const deleteRow: Command.Pure = ({state}) => {
    let cx = tableContext(state)
    if (!cx) return false
    let {map} = cx,
        rect = selectedRect(state, cx)
    if (rect.startRow == 0 && rect.endRow == map.height) {
        return {
            changes: {from: map.tablePos, to: map.tablePos + map.table.length, fit: true},
            selection: (cx) => EditorSelection.near(cx, map.tablePos, -1),
            userEvent: "delete.table",
        }
    }

    let changes: ChangeSet.Spec[] = [],
        handled = new Set<number>()

    for (let col = 0; col < map.width; col++) {
        if (rect.startRow > 0) {
            let above = map.cellAt(col, rect.startRow - 1)
            if (above != null && !handled.has(above) && map.cellAt(col, rect.startRow) == above) {
                let cellRect = map.cellRect(above)
                let rowsAbove = rect.startRow - cellRect.startRow,
                    rowsBelow = Math.max(0, cellRect.endRow - rect.endRow)
                let rows = rowsAbove + rowsBelow
                changes.push(
                    rows == 1
                        ? {from: above, remove: RowSpan.isInSet(map.getCell(above).marks)!}
                        : {from: above, add: RowSpan.of(rows)},
                )
                handled.add(above)
            }
        }
        if (rect.endRow < map.height) {
            let below = map.cellAt(col, rect.endRow)
            if (below != null && !handled.has(below) && map.cellAt(col, rect.endRow - 1) == below) {
                let cell = map.getCell(below),
                    cellRect = map.cellRect(below)
                let rowSpan = cellRect.endRow - rect.endRow
                changes.push({from: below, to: below + cell.length})
                let copy = cell.withMarks(
                    rowSpan == 1 ? RowSpan.removeFromSet(cell.marks) : RowSpan.of(rowSpan).addToSet(cell.marks),
                )
                changes.push({from: map.cellInsertionPos(cellRect.startCol, rect.endRow), insert: [copy]})
                handled.add(below)
            }
        }
    }

    let delPos = state.selection.from
    for (let row = rect.startRow; row < rect.endRow; row++) {
        let rowPos = map.rowPos(row),
            rowNode = map.table.content[row]
        delPos = Math.min(delPos, rowPos)
        changes.push({from: rowPos, to: rowPos + rowNode.length})
    }
    return {
        changes,
        selection: (cx) => EditorSelection.near(cx, delPos, -1),
        userEvent: "delete.row",
    }
}

/**
 * Merge a multi-cell {@link CellSelection} into one cell with col/row spans.
 * Fails when only one cell is selected or cells overlap the selection rectangle.
 */
export const mergeCells: Command.Pure = ({state}) => {
    if (!(state.selection instanceof CellSelection) || state.selection.ranges.length == 1) return false
    let cx = tableContext(state)!
    let {map} = cx,
        rect = selectedRect(state, cx)
    if (map.cellsOverlapRectangle(rect)) return false

    let movedContent: Node[] = [],
        changes: ChangeSet.Spec[] = []
    for (let i = 1; i < cx.cells.length; i++) {
        let pos = cx.cells[i],
            node = map.getCell(pos)
        if (node.content.length && !(node.content[0].isPlot && !node.content[0].content.length))
            movedContent = movedContent.concat(node.content)
        changes.push({from: pos, to: pos + node.length})
    }
    let pos = cx.cells[0]
    let width = rect.endCol - rect.startCol,
        height = rect.endRow - rect.startRow
    if (width > 1) changes.push({from: pos, add: ColSpan.of(width)})
    if (height > 1) changes.push({from: pos, add: RowSpan.of(height)})
    if (movedContent.length) changes.push({from: map.cellEnd(pos) - 1, insert: movedContent})
    return {
        changes,
        selection: (cx) => CellSelection.between(cx.doc, pos, pos + cx.doc.nodeAt(pos)!.length)!,
        userEvent: "join.cell",
    }
}

/**
 * Split a single spanned cell into unit cells.
 * Requires exactly one selected cell with col and/or row span &gt; 1.
 */
export const splitCell: Command.Pure = ({state}) => {
    let cx = tableContext(state)
    if (!cx || cx.cells.length > 1) return false
    let {map} = cx,
        pos = cx.cells[0],
        node = map.getCell(pos)
    let colSpan = ColSpan.isInSet(node.marks),
        rowSpan = RowSpan.isInSet(node.marks)
    if (!colSpan && !rowSpan) return false

    let changes: ChangeSet.Spec[] = [],
        rect = map.cellRect(pos),
        lastInsert = -1
    for (let row = rect.startRow, first = true; row < rect.endRow; row++) {
        let insertPos = (lastInsert = map.cellInsertionPos(rect.endCol, row))
        let cell = state.schema.createAndFill(node.type.default!)
        for (let col = rect.startCol; col < rect.endCol; col++) {
            if (first) {
                first = false
                continue
            }
            changes.push({from: insertPos, insert: [cell]})
        }
    }
    if (colSpan) changes.push({from: pos, remove: colSpan})
    if (rowSpan) changes.push({from: pos, remove: rowSpan})
    return {
        changes,
        selection: (cx, changes) => CellSelection.between(cx.doc, pos, changes.mapPos(lastInsert, 1))!,
        userEvent: "split.cell",
    }
}
