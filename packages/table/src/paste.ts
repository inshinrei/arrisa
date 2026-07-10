/**
 * Table-aware clipboard paste and drag-drop.
 *
 * Pure helpers ({@link handleTablePaste}, {@link insertCells}) are testable
 * without a view. Facet handlers dispatch those results on the editor.
 */
import {ChangeSet, Node, Slice, Token, type Plot, type Schema} from "@arrisa/doc"
import {Arrisa} from "@arrisa/editor"
import {EditorState, Transaction} from "@arrisa/state"
import {ColSpan, RowSpan, Table, TableRow} from "@arrisa/types"
import {CellSelection} from "./cell-selection"
import {cellTag, tableContext} from "./context"
import {TableMap} from "./table-map"

function fitSlice(schema: Schema, parent: Plot.Tag, slice: Slice, context: readonly Plot.Tag[]) {
    let wrap = schema.findWrapping(schema.docTag.type, parent.type)
    if (!wrap) return null
    let content = [schema.createAndFill(parent)]
    for (let i = wrap.length - 1; i >= 0; i--) content = [wrap[i].create(content)]
    let doc = schema.doc(content)
    let changes = ChangeSet.create(doc, {
        from: wrap.length + 1,
        to: doc.length - wrap.length - 1,
        insert: slice,
        fit: context,
    })
    doc = changes.apply(doc)
    let node = doc.length > wrap.length && doc.plotAt(wrap.length)
    return node && node.type == parent.type ? node : null
}

function isTableContent(schema: Schema, type: Node.Type) {
    return type == TableRow.type || schema.matchNode(type, Node.Group.TableCell)
}

function pastedCells(schema: Schema, slice: Slice, context: readonly Plot.Tag[]) {
    let table: Plot | null = null,
        tok
    if (slice.content.length == 1 && (tok = slice.content[0]).tokenType == Token.Type.Node && tok.type == Table.type) {
        table = tok as Plot
    } else if (
        (context.length && isTableContent(schema, context[0].type)) ||
        slice.content.some((tok) => tok.tokenType != Token.Type.Close && isTableContent(schema, tok.type))
    ) {
        table = fitSlice(schema, Table, slice, context)
    }
    return (
        table &&
        ensureRectangular(
            schema,
            table.content.map((row) => (row as Plot).content),
        )
    )
}

/** Pad/trim rows so every row has the same effective width (accounting for spans). */
function ensureRectangular(schema: Schema, rows: (readonly Node[])[]) {
    let widths: number[] = []
    for (let i = 0; i < rows.length; i++) {
        for (let cell of rows[i]) {
            let rowSpan = cell.mark(RowSpan) ?? 1,
                colSpan = cell.mark(ColSpan) ?? 1
            for (let r = i; r < i + rowSpan; r++) widths[r] = (widths[r] || 0) + colSpan
        }
    }
    let width = widths.reduce((a, b) => Math.max(a, b))
    for (let r = 0; r < widths.length; r++) {
        if (r >= rows.length) rows[r] = []
        for (let i = widths[r]; i < width; i++) rows[r] = rows[r].concat(schema.createAndFill(cellTag(schema)))
    }
    return {height: rows.length, width, rows}
}

/**
 * Clip or tile pasted cells to exactly `newWidth` × `newHeight`.
 * Shrinks edge spans when clipping; tiles rows/cols when growing.
 */
function clipCells(
    {width, height, rows}: {width: number; height: number; rows: (readonly Node[])[]},
    newWidth: number,
    newHeight: number,
) {
    if (width != newWidth) {
        let added = new Map<number, number>()
        rows = rows.map((row, i) => {
            let cells: Node[] = [],
                size = added.get(i) ?? 0,
                j = 0
            while (size < newWidth) {
                let nextCell = row[j++ % row.length]
                let rowSpan = nextCell.mark(RowSpan) ?? 1,
                    colSpan = nextCell.mark(ColSpan) ?? 1
                if (size + colSpan > newWidth) {
                    colSpan = newWidth - size
                    nextCell = nextCell.withMarks(
                        colSpan == 1
                            ? ColSpan.removeFromSet(nextCell.marks)
                            : ColSpan.of(colSpan).addToSet(nextCell.marks),
                    )
                }
                for (let k = 1; k < rowSpan; k++) added.set(i + k, (added.get(i + k) ?? 0) + colSpan)
                size += colSpan
                cells.push(nextCell)
            }
            return cells
        })
    }
    if (height != newHeight) {
        let newRows: (readonly Node[])[] = []
        for (let i = 0; i < newHeight; i++) {
            let nextRow = rows[i % rows.length],
                space = newHeight - i
            newRows.push(
                nextRow.map((cell) => {
                    let rowSpan = cell.mark(RowSpan) ?? 1
                    return rowSpan <= space
                        ? cell
                        : cell.withMarks(
                              space == 1 ? RowSpan.removeFromSet(cell.marks) : RowSpan.of(space).addToSet(cell.marks),
                          )
                }),
            )
        }
        rows = newRows
    }

    return {height: newHeight, width: newWidth, rows}
}

function growTableHorizontally(schema: Schema, map: TableMap, width: number) {
    let changes: ChangeSet.Spec[] = []
    if (width > map.width) {
        for (let row = 0; row < map.height; row++) {
            let lastCell = (map.table.content[row] as Plot).lastChild
            let fillCell = schema.createAndFill((lastCell || cellTag(schema)).type.default!),
                cells = []
            for (let i = map.width; i < width; i++) cells.push(fillCell)
            changes.push({from: map.cellInsertionPos(map.width, row), insert: cells})
        }
    }
    return changes
}

function growTableVertically(schema: Schema, map: TableMap, height: number) {
    let changes: ChangeSet.Spec[] = []
    if (height > map.height) {
        let cells: Node[] = []
        for (let i = 0; i < map.width; i++) cells.push(schema.createAndFill(cellTag(schema)))
        let row = TableRow.create(cells),
            rows = []
        for (let i = map.height; i < height; i++) rows.push(row)
        changes.push({from: map.rowPos(map.height), insert: rows})
    }
    return changes
}

/** Split rowspans that cross the horizontal paste boundary at `row`. */
function isolateVertically(schema: Schema, map: TableMap, startCol: number, endCol: number, row: number) {
    let changes: ChangeSet.Spec[] = []
    if (row == 0 || row == map.height) return changes
    for (let col = startCol; col < endCol; ) {
        let pos = map.cellAt(col, row)
        if (pos != null && map.cellAt(col, row - 1) == pos) {
            let node = map.getCell(pos),
                rect = map.cellRect(pos)
            let topRows = row - rect.startRow,
                botRows = rect.endRow - row
            changes.push(
                topRows == 1
                    ? {from: pos, remove: RowSpan.isInSet(node.marks)!}
                    : {from: pos, add: RowSpan.of(topRows)},
            )
            let split = node.tag.withMarks(
                botRows == 1 ? RowSpan.removeFromSet(node.marks) : RowSpan.of(botRows).addToSet(node.marks),
            )
            changes.push({from: map.cellInsertionPos(rect.startCol, row), insert: [schema.createAndFill(split)]})
            col = rect.endCol
        } else {
            col++
        }
    }
    return changes
}

/** Split colspans that cross the vertical paste boundary at `col`. */
function isolateHorizontally(schema: Schema, map: TableMap, startRow: number, endRow: number, col: number) {
    let changes: ChangeSet.Spec[] = []
    if (col == 0 || col == map.width) return changes
    for (let row = startRow; row < endRow; ) {
        let pos = map.cellAt(col, row)
        if (pos != null && map.cellAt(col - 1, row) == pos) {
            let node = map.getCell(pos),
                rect = map.cellRect(pos)
            let topCols = col - rect.startCol,
                botCols = rect.endCol - col
            changes.push(
                topCols == 1
                    ? {from: pos, remove: ColSpan.isInSet(node.marks)!}
                    : {from: pos, add: ColSpan.of(topCols)},
            )
            let split = node.tag.withMarks(
                botCols == 1 ? ColSpan.removeFromSet(node.marks) : ColSpan.of(botCols).addToSet(node.marks),
            )
            changes.push({from: map.cellInsertionPos(col, row), insert: [schema.createAndFill(split)]})
            row = rect.endRow
        } else {
            row++
        }
    }
    return changes
}

/**
 * Insert a rectangular block of cells into `map` at `(startCol, startRow)`,
 * growing the table and isolating spans as needed so the region is clean.
 */
export function insertCells(
    state: EditorState,
    map: TableMap,
    startCol: number,
    startRow: number,
    cells: {width: number; height: number; rows: (readonly Node[])[]},
    userEvent: string,
): Transaction.Spec {
    let {schema} = state.doc
    let endCol = startCol + cells.width,
        endRow = startRow + cells.height
    let doc = state.doc,
        changeSet: ChangeSet | null = null,
        changes: ChangeSet.Spec[] = []
    function flush() {
        if (changes.length) {
            let newSet = ChangeSet.create(doc, changes)
            doc = newSet.apply(doc)
            changeSet = changeSet ? changeSet.compose(newSet) : newSet
            let table = doc.resolvePlot(map.tablePos)!
            map = TableMap.get(table.node, table.start)
            changes = []
        }
    }

    if (map.width < endCol) changes = growTableHorizontally(schema, map, endCol)
    else if (endCol < map.width) changes = isolateHorizontally(schema, map, startRow, endRow, endCol)
    flush()
    if (startCol) changes = isolateHorizontally(schema, map, startRow, endRow, startCol)
    flush()
    if (map.height < endRow) changes = growTableVertically(schema, map, endRow)
    else if (endRow < map.height) changes = isolateVertically(schema, map, startCol, endCol, endRow)
    flush()
    if (startRow) changes = isolateVertically(schema, map, startCol, endCol, startRow)
    flush()

    for (let i = 0; i < cells.height; i++) {
        let content = cells.rows[i],
            row = startRow + i
        changes.push({
            from: map.cellInsertionPos(startCol, row),
            to: map.cellInsertionPos(endCol, row),
            insert: content,
        })
    }
    flush()
    let startCell = map.cellAt(startCol, startRow)
    let endCell = map.cellAt(endCol - 1, endRow - 1)
    let selection =
        startCell == null || endCell == null
            ? undefined
            : CellSelection.between(doc, startCell, endCell + map.getCell(endCell).length)!
    return {
        changes: changeSet!,
        selection,
        userEvent,
    }
}

/**
 * Handle pasting (or dropping at `drop`) table-shaped content into the current
 * cell or cell selection. Returns a transaction spec or `false`.
 */
export function handleTablePaste(state: EditorState, slice: Slice, context: readonly Plot.Tag[], drop?: number) {
    let {schema} = state.doc
    if (drop == null && state.selection instanceof CellSelection) {
        let cells = pastedCells(schema, slice, context)
        if (!cells) {
            let single = fitSlice(schema, cellTag(schema), slice, context)
            if (!single) return false
            cells = {width: 1, height: 1, rows: [[single]]}
        }
        let table = state.sel.from.parent!.parent!,
            map = TableMap.get(table.node, table.start)
        let rect = map.rectBetween(state.selection.anchorCell, state.selection.headCell)
        return insertCells(
            state,
            map,
            rect.startCol,
            rect.startRow,
            clipCells(cells, rect.endCol - rect.startCol, rect.endRow - rect.startRow),
            "input.paste",
        )
    } else {
        let cx = tableContext(state, drop),
            cells
        if (!cx || !(cells = pastedCells(schema, slice, context))) return false
        let rect = cx.map.cellRect(cx.cells[0])
        return insertCells(
            state,
            cx.map,
            rect.startCol,
            rect.startRow,
            cells,
            drop == null ? "input.paste" : "input.drop",
        )
    }
}

/** Editor paste facet: apply {@link handleTablePaste} when it returns a spec. */
export const tablePasteHandler: EditorState.Extension = Arrisa.pasteHandler.of((editor, _event, slice, context) => {
    let tr = handleTablePaste(editor.state, slice, context)
    return tr && (editor.dispatch(tr), true)
})

/**
 * Editor drop facet: paste at drop position; when `move` is set, clear moved
 * cell contents after inserting.
 */
export const tableDropHandler: EditorState.Extension = Arrisa.dropHandler.of((editor, _event, pos, move, slice, context) => {
    let tr = handleTablePaste(editor.state, slice, context, pos)
    if (!tr) return false
    if (move) {
        let clear: ChangeSet.Spec[] = []
        editor.state.doc.iterate(move.from, move.to, (node, pos) => {
            if (editor.state.schema.matchNode(node.type, Node.Group.TableCell))
                clear.push({from: pos + 1, to: pos + node.length - 1, fit: true})
        })
        let tr2 = editor.state.update(Transaction.merge(editor.state, tr, {changes: clear}))
        editor.dispatch(tr2)
    } else {
        editor.dispatch(tr)
    }
    return true
})
