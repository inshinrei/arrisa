/**
 * @arrisa/table — table editing for Arrisa: cell selection, structure commands, paste, menu.
 *
 * **Usage**
 * - Install the bundle: `tables()` (schema, selection, correction, paste, menu)
 * - Or compose pieces: `CellSelection`, commands, `tableMenu()`, `handleTablePaste`, …
 *
 * **Layering** (acyclic): `table-map` → `context` / `cell-selection` → `commands` /
 * `paste` / `correct` → `menu` → `table` (composition) → this index.
 *
 * Types for cells/rows/spans live in `@arrisa/types`; this package is the editor chrome.
 */
export {tables} from "./table"
export {tableMenu} from "./menu"
export {tableTheme} from "./theme"
export {CellSelection} from "./cell-selection"
export {
    addColumn,
    addRow,
    deleteColumn,
    deleteRow,
    toggleHeaderCell,
    mergeCells,
    splitCell,
} from "./commands"
export {handleTablePaste, insertCells, tablePasteHandler, tableDropHandler} from "./paste"
export {TableMap, Rect, type Problem} from "./table-map"
export {tableContext, cellTag, headerCellTag} from "./context"
export {tableCorrection} from "./correct"
