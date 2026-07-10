/**
 * Table insert grid, row/column ops, header toggle, merge/split.
 * `$1` / `$2` in dimension phrases are row and column counts.
 */
import {PhraseSet} from "../phrase-set"

export const tablePhrases = PhraseSet.define({
    dimensions_title: "Table dimensions $1 by $2. Use arrow keys to change.",
    dimensions_live: "$1 by $2",
    insert_table: "Insert a table",
    modify_table: "Modify table",
    toggle_header: "Toggle header cells",
    add_row_above: "Add row above",
    add_row_below: "Add row below",
    delete_row: "Delete row",
    add_col_before: "Add column before",
    add_col_after: "Add column after",
    delete_col: "Delete column",
    merge_cells: "Merge cells",
    split_cell: "Split cell",
})
