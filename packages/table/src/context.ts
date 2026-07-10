/**
 * Shared table lookup helpers used by commands, paste, and the insert picker.
 *
 * Leaf shared module (same role as `image-shared` in `@arrisa/schema`): keeps
 * feature modules from importing each other just for `tableContext` / cell tags.
 */
import {Node, type Pos, type Schema} from "@arrisa/doc"
import {EditorState} from "@arrisa/state"
import {BlockCell, BlockHeaderCell, Cell, HeaderCell} from "@arrisa/types"
import {CellSelection} from "./cell-selection"
import {TableMap} from "./table-map"

/**
 * Resolve the table and selected cell starts for structure commands.
 *
 * When `pos` is given (or the selection is not a {@link CellSelection}), uses
 * the cell containing that position / the cursor. Otherwise uses all cells in
 * the cell selection. Returns `null` outside a table.
 */
export function tableContext(state: EditorState, pos?: number) {
    let table: Pos.Plot | undefined, cells: number[] | undefined
    if (pos != null || !(state.selection instanceof CellSelection)) {
        let ref = pos != null ? state.doc.resolve(pos) : state.sel.head
        let cellPos = ref.matchingParent((node) => state.schema.matchNode(node.type, Node.Group.TableCell))
        if (cellPos && cellPos.parent?.parent) {
            table = cellPos.parent.parent
            cells = [cellPos.before]
        }
    } else {
        table = state.sel.anchor.parent!.parent!
        cells = state.selection.ranges.map((r) => r.from - 1)
    }
    return cells ? {cells, map: TableMap.get(table!.node, table!.start)} : null
}

/** Prefer inline {@link Cell}, else {@link BlockCell}. Throws if neither is registered. */
export function cellTag(schema: Schema) {
    if (schema.has(Cell)) return Cell
    if (schema.has(BlockCell)) return BlockCell
    throw new Error(`No cell type in schema`)
}

/** Prefer {@link HeaderCell}, else {@link BlockHeaderCell}, else `null`. */
export function headerCellTag(schema: Schema) {
    if (schema.has(HeaderCell)) return HeaderCell
    if (schema.has(BlockHeaderCell)) return BlockHeaderCell
    return null
}
