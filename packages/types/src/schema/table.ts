/**
 * Table structure: cells, rows, table container, and span marks.
 */
import {Plot, Mark, Node, Elt, parse} from "@arrisa/doc"

const G = Node.Group

/** Inline table cell (`td`). Isolating; group {@link Node.Group.TableCell}. */
export const Cell = Plot.define("Cell", {
    inlineContent: true,
    group: G.TableCell,
    isolating: true,
    cursorBarrier: false,
    shape: {element: "td"},
})

/** Inline header cell (`th`). Isolating; group {@link Node.Group.TableCell}. */
export const HeaderCell = Plot.define("HeaderCell", {
    inlineContent: true,
    group: G.TableCell,
    isolating: true,
    cursorBarrier: false,
    shape: {element: "th"},
})

/**
 * Block table cell (`td`) holding block content.
 * Same type name as {@link Cell}; use when cells need nested blocks.
 */
export const BlockCell = Plot.define("Cell", {
    blockContent: G.Content,
    group: G.TableCell,
    isolating: true,
    cursorBarrier: false,
    shape: {element: "td"},
})

/**
 * Block header cell (`th`) holding block content.
 * Same type name as {@link HeaderCell}.
 */
export const BlockHeaderCell = Plot.define("HeaderCell", {
    blockContent: G.Content,
    group: G.TableCell,
    isolating: true,
    cursorBarrier: false,
    shape: {element: "th"},
})

/** Table row (`tr`) of {@link Node.Group.TableCell} children. May be empty. */
export const TableRow = Plot.define("TableRow", {
    blockContent: G.TableCell,
    canBeEmpty: true,
    orientation: "row",
    shape: {element: "tr"},
})

/**
 * Table (`table` > `tbody` > rows). Isolating content block.
 * Parses from a bare `table` selector.
 */
export const Table = Plot.define("Table", {
    blockContent: TableRow,
    isolating: true,
    group: G.Content,
    shape: {structure: Elt.mk("table", [Elt.mk("tbody", [0])])},
    parseRules: [{selector: "table"}],
})

/** Require a positive integer param; throw {@link RangeError} otherwise. */
function validatePosInt(value: any) {
    if (typeof value != "number" || Math.round(value) != value || value < 1)
        throw new RangeError(`${value} is not a positive integer`)
}

/** Parse a positive integer attribute; return {@link parse.Reject} on failure. */
function readPosInt(value: string) {
    let num = Number.parseInt(value)
    if (Number.isNaN(num) || num < 1) return parse.Reject
    return num
}

/** Column span on a table cell (`colspan`). Targets {@link Node.Group.TableCell}. */
export const ColSpan = Mark.Type.define<number>("ColSpan", {
    target: G.TableCell,
    validate: validatePosInt,
    shape: {attribute: "colspan", value: (span: number) => String(span), readAttribute: readPosInt},
})

/** Row span on a table cell (`rowspan`). Targets {@link Node.Group.TableCell}. */
export const RowSpan = Mark.Type.define<number>("RowSpan", {
    target: G.TableCell,
    validate: validatePosInt,
    shape: {attribute: "rowspan", value: (span: number) => String(span), readAttribute: readPosInt},
})
