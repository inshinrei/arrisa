/**
 * Multi-cell table selection: model, decorations, keyboard/mouse handlers.
 *
 * Install via {@link CellSelection.extension} (also accepted when the class is
 * passed as an extension value). Depends on {@link TableMap}; does not import
 * commands or paste modules.
 */
import {Command, type Arrisa, moveByLine, moveByUnit, moveByWord, moveToLineSide} from "@arrisa/command"
import {ChangeSet, Node, type Plot, type Pos, ValidationError} from "@arrisa/doc"
import {Arrisa as Editor, Decoration, PointSet} from "@arrisa/editor"
import {EditorSelection, EditorState, Transaction} from "@arrisa/state"
import {Table, TableRow} from "@arrisa/types"
import {TableMap} from "./table-map"

const cellSelectionDeco = EditorState.Field.define<PointSet<Decoration.Point>>({
    create: getCellDeco,
    update: (deco, tr) => {
        return tr.docChanged || tr.selection ? getCellDeco(tr.state) : deco
    },
    provide: (f) => Decoration.Point.source.of((s) => s.field(f)),
})

const selectedCell = Decoration.Point.attributes({class: "arrisa-selected-cell"})

function getCellDeco(state: EditorState): PointSet<Decoration.Point> {
    if (!(state.selection instanceof CellSelection)) return PointSet.empty
    return PointSet.create(state.selection.ranges.map(({from}) => [from - 1, selectedCell]))
}

const tableSelectionFilter = EditorState.prec.low(
    Transaction.extender.of((tr) => {
        let normalized = CellSelection.normalize(tr.newSelection, tr.newDoc)
        return normalized ? {selection: normalized} : null
    }),
)

type Dir = "left" | "right" | "forward" | "backward" | "up" | "down"

function resolveDir(dir: "left" | "right", state: EditorState): "forward" | "backward" {
    let block = state.sel.head.textblockParent
    return (dir == "right") == (block ? state.textblockLTR(block.node) : state.textLTR) ? "forward" : "backward"
}

/** Arrow motion inside a cell selection: collapse or extend by cell. */
function cursorCommand(editor: Arrisa, {dir, extend}: {dir: Dir; extend?: boolean}) {
    let {state} = editor,
        {selection} = state
    if (!(selection instanceof CellSelection)) return false
    let newSel
    if (!extend) {
        newSel = EditorSelection.near(state, selection.replacementRange.from, 1)
    } else {
        if (dir == "left" || dir == "right") dir = resolveDir(dir, state)
        newSel = selection.moveHead(state.doc, dir)
        if (!newSel) {
            let forward = dir == "forward" || dir == "down"
            let table = state.sel.from.parent!.parent!
            let next = EditorSelection.near(state, forward ? table.after : table.before, forward ? 1 : -1)
            newSel = EditorSelection.range(forward ? table.before : table.after, next.head, next.headSide)
        }
    }
    editor.dispatch({
        selection: newSel,
        scrollIntoView: true,
        userEvent: "select",
    })
    return true
}

/** Home/End-style motion: move head to first/last cell in the row direction. */
function moveToRowSide(
    editor: Arrisa,
    {dir, extend}: {dir: "left" | "right" | "forward" | "backward"; extend?: boolean},
) {
    let {state} = editor,
        {selection} = state
    if (!(selection instanceof CellSelection)) return false
    if (dir == "left" || dir == "right") dir = resolveDir(dir, state)
    for (;;) {
        let next: CellSelection | null = (selection as CellSelection).moveHead(state.doc, dir)
        if (!next) break
        selection = next
    }
    if (selection != state.selection)
        editor.dispatch({
            selection,
            scrollIntoView: true,
            userEvent: "select",
        })
    return true
}

const cellSelectionTripleClick = Editor.mouseSelectionStyle.of((editor, event) => {
    if (event.detail == 3) {
        let pos = editor.state.doc.resolve(editor.posAtCoords({x: event.clientX, y: event.clientY}).pos)
        let cell = pos.matchingParent((n) => editor.state.schema.matchNode(n.type, Node.Group.TableCell))
        if (cell) {
            let from = cell.before,
                to = cell.after
            return {
                get() {
                    return CellSelection.between(editor.state.doc, from, to) || EditorSelection.near(editor.state, from, 1)
                },
                update(update) {
                    from = update.changes.mapPos(from, 1)
                    to = Math.max(from, update.changes.mapPos(to, -1))
                },
            }
        }
    }
    return null
})

/**
 * Selection spanning one or more table cells.
 *
 * Ranges cover cell *content* (`from` = after open, `to` = before close).
 * `anchorCell` / `headCell` are document positions of the cell open tokens used
 * for rectangle math.
 */
export class CellSelection extends EditorSelection {
    /**
     * Selection registration, cell highlight decorations, keyboard handlers,
     * and triple-click cell selection.
     */
    static extension: EditorState.Extension = [
        EditorSelection.define<CellSelection, {anchor: number; head: number}>(
            "cell",
            CellSelection as any,
            (sel) => ({anchor: sel.anchor, head: sel.head}),
            (doc, json) => {
                if (!json || typeof json.anchor != "number" || typeof json.head != "number")
                    throw new ValidationError("Invalid JSON data for CellSelection")
                let sel = CellSelection.between(doc, json.anchor, json.head)
                if (!sel) throw new ValidationError("Cell selection from JSON doesn't span actual cells")
                return sel
            },
        ),
        cellSelectionDeco,
        tableSelectionFilter,
        Command.handler(moveByUnit, cursorCommand),
        Command.handler(moveByWord, cursorCommand),
        Command.handler(moveByLine, cursorCommand),
        Command.handler(moveToLineSide, moveToRowSide),
        cellSelectionTripleClick,
    ]

    private constructor(
        anchor: number,
        head: number,

        /** Document position of the anchor cell’s open token. */
        readonly anchorCell: number,

        /** Document position of the head cell’s open token. */
        readonly headCell: number,

        readonly _ranges: readonly {from: number; to: number}[],

        readonly anchorRange: number,
    ) {
        super(anchor, head)
    }

    get ranges() {
        return this._ranges
    }

    get replacementRange() {
        return this._ranges[this.anchorRange]
    }

    get domSelection() {
        let {from, to} = this.replacementRange
        return {anchor: from, anchorSide: 1, head: to, headSide: -1} as const
    }

    /**
     * Build a cell selection between two document positions that lie on cell
     * boundaries (typically cell open/close). Returns `null` when the positions
     * are not in the same table or do not cover cells.
     */
    static between(doc: Plot.Doc, anchor: number, head: number) {
        let from = doc.resolve(Math.min(anchor, head)),
            to = doc.resolve(Math.max(anchor, head))
        let fromCell = from.nodeAfter,
            toCell = to.nodeBefore,
            table = from.parent?.parent
        if (
            anchor == head ||
            !fromCell ||
            !doc.schema.matchNode(fromCell.type, Node.Group.TableCell) ||
            !toCell ||
            !doc.schema.matchNode(toCell.type, Node.Group.TableCell) ||
            !table ||
            table.start > to.pos ||
            table.end < to.pos
        )
            return null
        let toPos = to.pos - toCell.length
        let map = TableMap.get(table.node, table.start)
        let cells = map.cellsInRect(map.rectBetween(from.pos, toPos))
        let anchorCell = anchor,
            headCell = head
        if (anchor > head) anchorCell -= toCell.length
        else headCell -= toCell.length
        return new CellSelection(
            anchor,
            head,
            anchorCell,
            headCell,
            cells.map((pos) => ({from: pos + 1, to: map.cellEnd(pos) - 1})),
            cells.indexOf(head - (head < anchor ? 0 : toCell.length)),
        )
    }

    /**
     * Normalize a non-cell selection that partially overlaps a table into either
     * a cell selection or an expanded range that fully includes the table.
     * Returns `null` when no change is needed.
     */
    static normalize(sel: EditorSelection, doc: Plot.Doc): EditorSelection | null {
        if (sel instanceof CellSelection) return null
        let {from, to} = sel,
            modified = false
        for (
            let parent: Pos.Plot | null = doc.resolve(sel.from).parent, cell: Pos.Plot | null = null;
            parent;
            parent = parent.parent
        ) {
            if (doc.schema.matchNode(parent.node.type, Node.Group.TableCell)) cell = parent
            if (parent.node.type == Table.type) {
                if (to > parent.end) {
                    from = parent.before
                    modified = true
                } else if (!cell || to > cell.end) {
                    let map = TableMap.get(parent.node, parent.start)
                    let start = map.nearestCell(from, 1),
                        end = map.nearestCell(to, -1)
                    if (start.from > end.from) end = start
                    return sel.anchor < sel.head
                        ? CellSelection.between(doc, start.from, end.to)
                        : CellSelection.between(doc, end.to, start.from)
                }
            }
        }
        for (let parent: Pos.Plot | null = doc.resolve(sel.to).parent; parent; parent = parent.parent) {
            if (parent.node.type == Table.type && from < parent.start) {
                to = parent.after
                modified = true
            }
        }
        return !modified ? null : sel.anchor < sel.head ? EditorSelection.range(from, to) : EditorSelection.range(to, from)
    }

    eq(other: EditorSelection) {
        return other instanceof CellSelection && other.anchor == this.anchor && other.head == this.head
    }

    map(changes: ChangeSet, cx: EditorSelection.Context, assoc: -1 | 1 = -1): EditorSelection {
        let fromPos = changes.mapPos(this.from, 1),
            toPos = changes.mapPos(this.to, -1)
        let from = cx.doc.resolve(fromPos),
            to = cx.doc.resolve(toPos)
        let after = from.nodeAfter,
            before = to.nodeBefore
        if (after && after.type == Table.type) fromPos += 2
        else if (after && after.type == TableRow.type) fromPos++
        if (before && before.type == Table.type) toPos -= 2
        else if (before && before.type == TableRow.type) toPos--
        return (
            (this.from == this.anchor
                ? CellSelection.between(cx.doc, fromPos, toPos)
                : CellSelection.between(cx.doc, toPos, fromPos)) ||
            EditorSelection.near(cx, changes.mapPos(this.head), assoc)
        )
    }

    /**
     * Move the head one cell in `dir` relative to the table grid.
     * Returns `null` when the head would leave the table.
     */
    moveHead(doc: Plot.Doc, dir: "up" | "down" | "forward" | "backward"): CellSelection | null {
        let head = doc.resolve(this.head),
            inv = this.head < this.anchor
        let headPos = this.head - (inv ? 0 : head.nodeBefore!.length)
        let table = head.parent!.parent!,
            map = TableMap.get(table.node, table.start),
            rect = map.cellRect(headPos)
        let anchorPos = inv ? map.nearestCell(this.anchor, -1).from : this.anchor
        let col = dir == "backward" ? rect.startCol - 1 : dir == "forward" ? rect.endCol : rect.startCol
        let row = dir == "up" ? rect.startRow - 1 : dir == "down" ? rect.endRow : rect.startRow
        if (col < 0 || col >= map.width || row < 0 || row >= map.height) return null
        let newHead = map.cellAt(col, row)
        if (newHead == null) return null
        return newHead >= anchorPos
            ? CellSelection.between(doc, anchorPos, map.cellEnd(newHead))
            : CellSelection.between(doc, newHead, map.cellEnd(anchorPos))
    }
}
