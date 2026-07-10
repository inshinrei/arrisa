/**
 * Table menu chrome: insert submenu (dimension picker) and modify-table actions.
 *
 * Each item is exported on {@link tableMenu} so hosts can re-rank or omit pieces.
 * Depends on commands and the dimension picker; does not import `table.ts`.
 */
import {Command, Menu} from "@arrisa/command"
import {tablePhrases} from "@arrisa/phrases"
import {EditorState} from "@arrisa/state"
import {ColSpan, RowSpan, Table} from "@arrisa/types"
import {CellSelection} from "./cell-selection"
import {
    addColumn,
    addRow,
    deleteColumn as _deleteColumn,
    deleteRow as _deleteRow,
    mergeCells as _mergeCells,
    splitCell as _splitCell,
    toggleHeaderCell,
} from "./commands"
import {headerCellTag} from "./context"
import {dimensionPicker} from "./dimension-picker"

/** Extension registering all default table menu items. */
export function tableMenu(): EditorState.Extension {
    return [
        tableMenu.createTable,
        tableMenu.modifyTable,
        tableMenu.toggleHeader,
        tableMenu.addRowAbove,
        tableMenu.addRowBelow,
        tableMenu.deleteRow,
        tableMenu.addColumnBefore,
        tableMenu.addColumnAfter,
        tableMenu.deleteColumn,
        tableMenu.mergeCells,
        tableMenu.splitCell,
    ]
}

const tableIcon = {
    icon: "M0 23a23 13 0 0 1 13-13h74a13 13 0 0 1 13 13v54a 13 13 0 0 1 -13 13h-74a13 13 0 0 1 -13 -13v-54M7 31v14h25v-14h-25M37 31v14h26v-14h-26M68 31v14h25v-14h-26M7 50v14h25v-14h-25M37 50v14h26v-14h-26M68 50v14h25v-14h-26M7 69v8a6 6 0 0 0 6 6h19v-14h-25M37 69v14h26v-14h-26M68 69v14h19a6 6 0 0 0 6 -6v-8h-26",
}

export namespace tableMenu {
    /** Insert-table submenu (visible when schema has Table and cursor is outside a table). */
    export const createTable = Menu.Submenu.define({
        select(state) {
            return state.schema.has(Table) && !state.sel.head.matchingParent((plot) => plot.type == Table.type)
        },
        label: tableIcon,
        description: tablePhrases.ref("insert_table"),
        parent: Menu.Group.insert,
        rank: 70,
        content: [dimensionPicker],
    })

    /** Modify-table submenu (visible when the selection is inside a table). */
    export const modifyTable = Menu.Submenu.define({
        select(state) {
            return !!state.sel.head.matchingParent((plot) => plot.type == Table.type)
        },
        label: tableIcon,
        description: tablePhrases.ref("modify_table"),
        parent: Menu.Group.block,
        rank: 90,
    })

    export const toggleHeader = Menu.Button.define({
        run: toggleHeaderCell,
        select: (state) => !!headerCellTag(state.schema),
        label: tablePhrases.ref("toggle_header"),
        parent: modifyTable,
        rank: 10,
    })

    export const addRowAbove = Menu.Button.define({
        run: (editor) => Command.dispatch(editor, addRow, "before"),
        label: tablePhrases.ref("add_row_above"),
        parent: modifyTable,
        rank: 20,
    })

    export const addRowBelow = Menu.Button.define({
        run: (editor) => Command.dispatch(editor, addRow, "after"),
        label: tablePhrases.ref("add_row_below"),
        parent: modifyTable,
        rank: 21,
    })

    export const deleteRow = Menu.Button.define({
        run: _deleteRow,
        label: tablePhrases.ref("delete_row"),
        parent: modifyTable,
        rank: 25,
    })

    export const addColumnBefore = Menu.Button.define({
        run: (editor) => Command.dispatch(editor, addColumn, "before"),
        label: tablePhrases.ref("add_col_before"),
        parent: modifyTable,
        rank: 30,
    })

    export const addColumnAfter = Menu.Button.define({
        run: (editor) => Command.dispatch(editor, addColumn, "after"),
        label: tablePhrases.ref("add_col_after"),
        parent: modifyTable,
        rank: 31,
    })

    export const deleteColumn = Menu.Button.define({
        run: _deleteColumn,
        label: tablePhrases.ref("delete_col"),
        parent: modifyTable,
        rank: 35,
    })

    export const mergeCells = Menu.Button.define({
        run: _mergeCells,
        select: (state) => {
            let {selection} = state
            return (
                selection instanceof CellSelection &&
                selection.ranges.length > 1 &&
                state.schema.has(ColSpan) &&
                state.schema.has(RowSpan)
            )
        },
        label: tablePhrases.ref("merge_cells"),
        parent: modifyTable,
        rank: 40,
    })

    export const splitCell = Menu.Button.define({
        run: _splitCell,
        select: (state) => {
            let {selection} = state
            if (!(selection instanceof CellSelection) || selection.ranges.length != 1) return false
            let cell = state.sel.from.nodeAfter
            return !!(cell && (cell.mark(ColSpan) || cell.mark(RowSpan)))
        },
        label: tablePhrases.ref("split_cell"),
        parent: modifyTable,
        rank: 41,
    })
}
