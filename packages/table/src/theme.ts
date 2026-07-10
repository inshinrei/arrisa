/**
 * Default table chrome styles (cells, selection highlight, dimension picker).
 * Uses `--arrisa-*` tokens from the editor base theme.
 */
import {Arrisa} from "@arrisa/editor"
import {type EditorState} from "@arrisa/state"

/** Style module for tables and the insert-table dimension picker. */
export const tableTheme: EditorState.Extension = Arrisa.styles({
    table: {
        borderCollapse: "collapse",
        tableLayout: "fixed",
        width: "100%",
        overflow: "hidden",
    },
    "td, th": {
        verticalAlign: "top",
        border: "1px solid var(--arrisa-border-color)",
        padding: "3px 6px",
        textAlign: "left",
    },

    ".arrisa-selected-cell": {
        background: "color-mix(in srgb, var(--arrisa-highlight-color) 22%, transparent)",
        "&::selection, & ::selection": {backgroundColor: "transparent"},
        "& :focus ::selection, & :focus::selection": {backgroundColor: "Highlight"},
    },

    ".arrisa-dimension-announce": {
        position: "absolute",
        width: "0px",
        overflow: "hidden",
    },
    ".arrisa-dimension-cell": {
        fill: "none",
        stroke: "var(--arrisa-border-color)",
        strokeWidth: "1.5px",
        rx: "2px",
    },
    ".arrisa-dimension-cell-active": {
        stroke: "var(--arrisa-highlight-color)",
    },
})
