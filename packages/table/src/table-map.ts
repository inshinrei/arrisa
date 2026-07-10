/**
 * Grid geometry for table nodes: column/row spans, cell positions, and structural problems.
 *
 * Pure leaf module — depends only on `@arrisa/doc` and `@arrisa/types`. Used by
 * selection, commands, paste, and correction; never imports those modules.
 *
 * **Map model**
 * - Row-major array of length `width * height`
 * - `0` = empty (missing cell)
 * - Positive values = cell start offset relative to the table’s content start
 * - Spanned cells share the same map entry as their origin cell
 */
import {type Plot} from "@arrisa/doc"
import {ColSpan, RowSpan, Table} from "@arrisa/types"

/** Inclusive-start / exclusive-end rectangle in table column/row coordinates. */
export class Rect {
    constructor(
        readonly startCol: number,
        readonly startRow: number,
        readonly endCol: number,
        readonly endRow: number,
    ) {}
}

/** Structural issues detected while building a map (fed to table correction). */
export type Problem =
    | {type: "collision"; pos: number}
    | {type: "missing"; row: number; n: number}
    | {type: "overlong_rowspan"; pos: number; n: number}

class MapData {
    constructor(
        readonly table: Plot,
        readonly width: number,
        readonly height: number,
        readonly map: number[],
        readonly problems: Problem[] | null,
        readonly cellEnds: Map<number, number>,
    ) {}
}

let cache = new WeakMap<Plot, MapData>()

/**
 * Cached geometry for a table plot at a known document start position.
 *
 * Create with {@link TableMap.get}. Cell positions in the public API are
 * document-absolute; internal map values are relative to `start`.
 */
export class TableMap {
    constructor(
        readonly start: number,
        readonly data: MapData,
    ) {}

    get width() {
        return this.data.width
    }
    get height() {
        return this.data.height
    }
    get table() {
        return this.data.table
    }
    /** Document position of the table node (start of the table open token). */
    get tablePos() {
        return this.start - 1
    }
    /** Structural problems for this table, or `null` when the grid is valid. */
    get problems() {
        return this.data.problems
    }

    /** Build or reuse a map for `table` whose content starts at `start`. */
    static get(table: Plot, start: number): TableMap {
        let data = cache.get(table)
        if (!data) cache.set(table, (data = computeMap(table)))
        return new TableMap(start, data)
    }

    /** Bounding box of the cell that starts at document position `pos`. */
    cellRect(pos: number) {
        let localPos = pos - this.start,
            {map, width, height} = this.data
        for (let i = 0; i < map.length; i++)
            if (map[i] == localPos) {
                let startCol = i % width,
                    startRow = (i / width) | 0
                let endCol = startCol + 1,
                    endRow = startRow + 1
                for (let j = 1; endCol < width && map[i + j] == localPos; j++) endCol++
                for (let j = 1; endRow < height && map[i + width * j] == localPos; j++) endRow++
                return new Rect(startCol, startRow, endCol, endRow)
            }
        throw new RangeError(`No cell with offset ${pos} found`)
    }

    /**
     * Nearest cell boundary around `pos`.
     * Prefer the cell before when `bias < 0` or the cursor sits inside that cell.
     */
    nearestCell(pos: number, bias: -1 | 1) {
        let localPos = pos - this.start,
            after = -1,
            before = -1
        let {map, cellEnds} = this.data
        for (let i = 0; i < map.length; i++) {
            let cellPos = map[i]
            if (cellPos > 0) {
                if (cellPos >= localPos && (after < 0 || after > cellPos)) after = cellPos
                if (cellPos < localPos && before < cellPos) before = cellPos
            }
        }
        if (before > -1) {
            let beforeEnd = cellEnds.get(before)!
            if (beforeEnd > localPos || after < 0 || bias < 0)
                return {from: before + this.start, to: beforeEnd + this.start}
        }
        return {from: after + this.start, to: cellEnds.get(after)! + this.start}
    }

    /** Document position just after the cell that starts at `pos`. */
    cellEnd(pos: number) {
        let end = this.data.cellEnds.get(pos - this.start)
        if (end == null) throw new Error(`No cell with offset ${pos} found`)
        return end + this.start
    }

    /** Minimal rectangle covering both cells `a` and `b` (document positions). */
    rectBetween(a: number, b: number) {
        let {startCol: startColA, endCol: endColA, startRow: startRowA, endRow: endRowA} = this.cellRect(a)
        let {startCol: startColB, endCol: endColB, startRow: startRowB, endRow: endRowB} = this.cellRect(b)
        return new Rect(
            Math.min(startColA, startColB),
            Math.min(startRowA, startRowB),
            Math.max(endColA, endColB),
            Math.max(endRowA, endRowB),
        )
    }

    /**
     * Document start positions of cells whose origin lies inside `rect`.
     * Spanned tails (non-origin map slots) are omitted.
     */
    cellsInRect(rect: Rect) {
        let result: number[] = [],
            seen = new Set<number>(),
            {map, width} = this.data
        for (let row = rect.startRow; row < rect.endRow; row++) {
            for (let col = rect.startCol; col < rect.endCol; col++) {
                let index = row * width + col,
                    pos = map[index]
                if (
                    pos > 0 &&
                    !seen.has(pos) &&
                    (col != rect.startCol || !col || map[index - 1] != pos) &&
                    (row != rect.startRow || !row || map[index - width] != pos)
                ) {
                    seen.add(pos)
                    result.push(pos + this.start)
                }
            }
        }
        return result
    }

    /** Document start of the cell at `(col, row)`, or `null` if empty. */
    cellAt(col: number, row: number) {
        let {width, map} = this.data
        let pos = map[col + row * width]
        return pos > 0 ? pos + this.start : null
    }

    /** Document position of the open of row `row` (0-based). */
    rowPos(row: number) {
        let {start} = this,
            {table} = this.data
        for (let r = 0; r < row; r++) start += table.content[r].length
        return start
    }

    /**
     * Position at which a new cell for `(col, row)` should be inserted
     * (inside the row, before the cell that currently occupies that slot).
     */
    cellInsertionPos(col: number, row: number) {
        let {width, map} = this.data
        for (let scan = col; ; scan++) {
            if (scan == width) return this.rowPos(row + 1) - 1
            let index = scan + row * width,
                pos = map[index]
            if (pos && (!row || (pos != map[index - width] && (!col || pos != map[index - 1])))) return pos + this.start
        }
    }

    /** The cell plot that starts at document position `pos`. */
    getCell(pos: number): Plot {
        let found = this.data.table.plotAt(pos - this.start)
        if (!found) throw new Error("Invalid cell position")
        return found
    }

    /**
     * Whether any cell straddles the edge of `rect` (merge is unsafe).
     * True when a cell extends outside the selection rectangle on any side.
     */
    cellsOverlapRectangle(rect: Rect) {
        let {width, height, map} = this.data
        let indexTop = rect.startRow * width + rect.startCol,
            indexBefore = indexTop
        let indexBottom = (rect.endRow - 1) * width + rect.endCol,
            indexAfter = indexTop + (rect.endCol - rect.startCol - 1)
        for (let i = rect.startRow; i < rect.endRow; i++) {
            if (
                (rect.startCol > 0 && sameCell(map[indexBefore], map[indexBefore - 1])) ||
                (rect.endCol < width && sameCell(map[indexAfter], map[indexAfter + 1]))
            )
                return true
            indexBefore += width
            indexAfter += width
        }
        for (let i = rect.startCol; i < rect.endCol; i++) {
            if (
                (rect.startRow > 0 && sameCell(map[indexTop], map[indexTop - width])) ||
                (rect.endRow < height && sameCell(map[indexBottom], map[indexBottom + width]))
            )
                return true
            indexTop++
            indexBottom++
        }
        return false
    }
}

function sameCell(a: number, b: number) {
    return a != 0 && a == b
}

function computeMap(table: Plot) {
    if (table.tag != Table) throw new RangeError(`Not a table node: ${table.type.name}`)
    let width = (table.content[0] as Plot).content.reduce((w, c) => w + (c.mark(ColSpan) ?? 1), 0)
    let height = table.content.length
    let map: number[] = [],
        problems: Problem[] | null = null
    for (let i = 0, e = width * height; i < e; i++) map[i] = 0
    let cellEnd = new Map<number, number>()

    for (let row = 0, pos = 0; row < height; row++) {
        let rowNode = table.content[row] as Plot,
            mapPos = row * width
        pos++
        for (let i = 0, col = 0; ; i++) {
            while (mapPos < map.length && map[mapPos] != 0) mapPos++
            if (i == rowNode.content.length) break
            let cellNode = rowNode.content[i]
            cellEnd.set(pos, pos + cellNode.length)
            let colSpan = cellNode.mark(ColSpan) ?? 1,
                rowSpan = cellNode.mark(RowSpan) ?? 1
            let exceed = col + colSpan - width
            if (exceed > 0) {
                map = growMap(map, width, height, exceed)
                width += exceed
                mapPos += row * exceed
            }
            for (let h = 0; h < rowSpan; h++) {
                if (h + row >= height) {
                    ;(problems || (problems = [])).push({type: "overlong_rowspan", pos, n: rowSpan - h})
                    break
                }
                let start = mapPos + h * width,
                    collided = 0
                for (let w = 0; w < colSpan; w++) {
                    if (map[start + w] == 0) map[start + w] = pos
                    else collided++
                }
                if (collided) (problems || (problems = [])).push({type: "collision", pos})
            }
            mapPos += colSpan
            col += colSpan
            pos += cellNode.length
        }
        pos++
    }
    for (let row = 0, i = width; row < height; row++, i += width) {
        let missing = 0
        while (missing < width && map[i - missing - 1] == 0) missing++
        if (missing) (problems || (problems = [])).push({type: "missing", row, n: missing})
    }

    return new MapData(table, width, height, map, problems, cellEnd)
}

function growMap(map: number[], width: number, height: number, count: number) {
    let newMap: number[] = []
    for (let row = 0, i = 0; row < height; row++) {
        for (let col = 0; col < width; col++) newMap.push(map[i++])
        for (let j = 0; j < count; j++) newMap.push(0)
    }
    return newMap
}
