/**
 * Table extension factory — composition root for the package.
 *
 * Assembles schema elements, theme, cell selection, correction, paste/drop,
 * and menu. Sibling modules must not import this file (avoids cycles); they
 * depend on leaves (`table-map`, `context`) instead.
 */
import {EditorState} from "@arrisa/state"
import {
    BlockCell,
    BlockHeaderCell,
    Cell,
    ColSpan,
    HeaderCell,
    RowSpan,
    Table,
    TableRow,
} from "@arrisa/types"
import {CellSelection} from "./cell-selection"
import {tableCorrection} from "./correct"
import {tableMenu} from "./menu"
import {tableDropHandler, tablePasteHandler} from "./paste"
import {tableTheme} from "./theme"

/**
 * Full table support for an editor.
 *
 * Registers `table` / `tr` / cells, optional header cells and col/row spans,
 * cell selection chrome, structure correction, paste/drop handlers, and menu.
 *
 * @param config.headerCells Include header cell types (default true).
 * @param config.cellSpanning Include ColSpan/RowSpan marks (default true).
 * @param config.cellContent `"inline"` (default) or `"block"` cell content model.
 */
export function tables(config: tables.Spec = {}): EditorState.Extension {
    let result: EditorState.Extension[] = [
        EditorState.schemaElement.of(Table),
        EditorState.schemaElement.of(TableRow),
        tableTheme,
        CellSelection,
        tableCorrection,
        tablePasteHandler,
        tableDropHandler,
        tableMenu(),
    ]
    if (config.cellContent == "block") {
        result.push(EditorState.schemaElement.of(BlockCell))
        if (config.headerCells != false) result.push(EditorState.schemaElement.of(BlockHeaderCell))
    } else {
        result.push(EditorState.schemaElement.of(Cell))
        if (config.headerCells != false) result.push(EditorState.schemaElement.of(HeaderCell))
    }
    if (config.cellSpanning != false)
        result.push(EditorState.schemaElement.of(RowSpan), EditorState.schemaElement.of(ColSpan))
    return result
}

export namespace tables {
    export type Spec = {
        /** When false, omit header cell types. Default true. */
        headerCells?: boolean
        /** When false, omit ColSpan/RowSpan. Default true. */
        cellSpanning?: boolean
        /** Cell content model: inline (default) or block. */
        cellContent?: "inline" | "block"
    }

    /** Standalone structure correction (also included by {@link tables}). */
    export const correction = tableCorrection

    /** Standalone paste handler. */
    export const pasteHandler: EditorState.Extension = tablePasteHandler

    /** Standalone drop handler. */
    export const dropHandler: EditorState.Extension = tableDropHandler

    /** Default table chrome styles (also included by {@link tables}). */
    export const theme: EditorState.Extension = tableTheme

    /** Default table menu items (call to get the extension set). */
    export const menu: typeof tableMenu = tableMenu
}
