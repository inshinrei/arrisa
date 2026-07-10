/**
 * Auto-fix malformed tables after local edits (missing cells, span collisions).
 *
 * Registered as a {@link Correction} on {@link Table} content. Uses
 * {@link TableMap.problems} produced during map computation.
 */
import {type ChangeSet, type Plot} from "@arrisa/doc"
import {Correction} from "@arrisa/state"
import {ColSpan, RowSpan, Table} from "@arrisa/types"
import {TableMap} from "./table-map"

/**
 * Content correction for table nodes: strip colliding spans, fill missing
 * cells, and clamp overlong rowspans.
 */
export const tableCorrection = Correction.onContent(Table, (pos) => {
    let map = TableMap.get(pos.node, pos.start)
    if (!map.problems) return null

    let {schema} = pos.doc

    let mustAdd: number[] = [],
        changes: ChangeSet.Spec[] = []
    for (let i = 0; i < map.height; i++) mustAdd.push(0)
    for (let i = 0; i < map.problems.length; i++) {
        let prob = map.problems[i]
        if (prob.type == "collision") {
            let cellPos = prob.pos + map.start,
                rect = map.cellRect(cellPos),
                cell = map.getCell(cellPos)
            let colSpan = ColSpan.isInSet(cell.marks),
                rowSpan = RowSpan.isInSet(cell.marks)
            if (colSpan) changes.push({from: cellPos, remove: colSpan})
            if (rowSpan) changes.push({from: cellPos, remove: rowSpan})
            for (
                let row = rect.startRow, endRow = row + (rowSpan ? rowSpan.value : 1), first = true;
                row < endRow;
                row++
            ) {
                for (let col = rect.startCol, endCol = col + (colSpan ? colSpan.value : 1); col < endCol; col++) {
                    if (first) {
                        first = false
                    } else if (map.cellAt(col, row) == cellPos) {
                        let from = cellPos
                        for (let scan = 0; from == cellPos; scan++) from = map.cellInsertionPos(col + scan, row)
                        changes.push({from, insert: [schema.createAndFill(cell.type.default!)]})
                    }
                }
            }
        } else if (prob.type == "missing") {
            mustAdd[prob.row] += prob.n
        } else if (prob.type == "overlong_rowspan") {
            let cell = map.getCell(prob.pos + map.start),
                cur = RowSpan.isInSet(cell.marks)!,
                newVal = cur.value - prob.n
            let from = pos.start + prob.pos
            changes.push(newVal == 1 ? {from, remove: cur} : {from, add: RowSpan.of(newVal)})
        }
    }
    let first: number | undefined, last: number | undefined
    for (let i = 0; i < mustAdd.length; i++)
        if (mustAdd[i]) {
            if (first == null) first = i
            last = i
        }

    for (let i = 0, curPos = pos.start; i < map.height; i++) {
        let row = pos.node.content[i] as Plot,
            end = curPos + row.length
        let add = mustAdd[i]
        if (add > 0) {
            let cell = schema.defaultContentPlot(row.tag.type)!
            let nodes = []
            for (let j = 0; j < add; j++) nodes.push(schema.createAndFill(cell))
            let side = (i == 0 || first == i - 1) && last == i ? curPos + 1 : end - 1
            changes.push({from: side, insert: nodes})
        }
        curPos = end
    }

    return changes
})
