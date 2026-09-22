/**
 * Four-space indent for textblocks with {@link Node.Role.Code}.
 * Both commands return false outside one, so Tab can move focus.
 */
import {type Command} from "@arrisa/command"
import {Leaf, Node, type Pos} from "@arrisa/doc"
import {EditorSelection, type EditorState} from "@arrisa/state"

const INDENT = "    "

type Unit = {pos: number; len: number; ch: string | null}

type Line = {start: number; end: number; units: Unit[]}

/** Code textblock that contains both selection ends, or null. */
function codeTextblock(state: EditorState): {block: Pos.Plot; selection: EditorSelection.Text} | null {
    let selection = state.selection
    if (!(selection instanceof EditorSelection.Text)) return null
    let anchorBlock = state.sel.anchor.textblockParent
    let headBlock = state.sel.head.textblockParent
    if (!anchorBlock || !headBlock || anchorBlock.start != headBlock.start) return null
    if (!anchorBlock.node.type.hasRole(Node.Role.Code)) return null
    return {block: anchorBlock, selection}
}

/**
 * Lines are maximal runs of block content that do not include `\n`.
 * A text leaf is one position per character. Any other child is an atom.
 */
function linesIn(block: Pos.Plot): Line[] {
    let lines: Line[] = []
    let units: Unit[] = []
    let lineStart = block.start
    let pos = block.start
    const push = (end: number) => {
        lines.push({start: lineStart, end, units})
        units = []
    }
    for (let child of block.node.content) {
        if (child.is(Leaf.Text)) {
            let text = child.param
            for (let i = 0; i < text.length; i++) {
                let ch = text[i]!
                if (ch == "\n") {
                    push(pos)
                    pos++
                    lineStart = pos
                } else {
                    units.push({pos, len: 1, ch})
                    pos++
                }
            }
        } else {
            units.push({pos, len: child.length, ch: null})
            pos += child.length
        }
    }
    lines.push({start: lineStart, end: pos, units})
    return lines
}

function lineAt(lines: readonly Line[], pos: number): Line | null {
    for (let line of lines) if (pos >= line.start && pos <= line.end) return line
    return null
}

/** Half-open `[from, to)` overlaps the line. An empty line overlaps when its position is inside. */
function lineOverlaps(line: Line, from: number, to: number): boolean {
    if (from >= to) return false
    if (line.start == line.end) return from <= line.start && line.start < to
    return line.start < to && line.end > from
}

function shift(pos: number, inserts: readonly number[]): number {
    let next = pos
    for (let at of inserts) if (at < pos) next += INDENT.length
    return next
}

/** Caret is at the line start, or every unit before it is a U+0020 space. */
function inLeadingSpace(line: Line, head: number): boolean {
    if (head == line.start) return true
    if (head < line.start || head > line.end) return false
    for (let unit of line.units) {
        if (unit.pos >= head) break
        if (unit.ch != " " || unit.pos + unit.len > head) return false
    }
    return true
}

/** Up to four leading spaces, or one leading tab. Null when the line has neither. */
function leadingCut(line: Line): {from: number; to: number} | null {
    let first = line.units[0]
    if (!first || first.ch == null) return null
    if (first.ch == "\t") return {from: first.pos, to: first.pos + first.len}
    if (first.ch != " ") return null
    let taken = 0
    let to = first.pos
    for (let unit of line.units) {
        if (unit.ch != " ") break
        taken++
        to = unit.pos + unit.len
        if (taken == INDENT.length) break
    }
    return taken ? {from: line.start, to} : null
}

/** One tab, or up to four spaces, sitting immediately before the caret. */
function cutBeforeCaret(line: Line, head: number): {from: number; to: number} | null {
    let before: Unit[] = []
    for (let unit of line.units) {
        if (unit.pos >= head) break
        if (unit.pos + unit.len > head) return null
        before.push(unit)
    }
    if (!before.length) return null
    let last = before[before.length - 1]!
    if (last.ch == "\t") return {from: last.pos, to: last.pos + last.len}
    if (last.ch != " ") return null
    let taken = 0
    let from = last.pos
    for (let i = before.length - 1; i >= 0; i--) {
        let unit = before[i]!
        if (unit.ch != " ") break
        taken++
        from = unit.pos
        if (taken == INDENT.length) break
    }
    return {from, to: head}
}

export const indentCodeBlock: Command.Pure = ({state}) => {
    let found = codeTextblock(state)
    if (!found) return false
    let {block, selection} = found
    if (selection.empty) {
        let head = selection.head
        return {
            changes: {from: head, to: head, insert: [Leaf.text(INDENT)]},
            selection: EditorSelection.Text.create({
                anchor: head + INDENT.length,
                headSide: -1,
                goalColumn: selection.goalColumn,
                marks: selection.marks,
            }),
            userEvent: "input.indent",
            scrollIntoView: true,
        }
    }
    let inserts: number[] = []
    for (let line of linesIn(block)) {
        if (lineOverlaps(line, selection.from, selection.to)) inserts.push(line.start)
    }
    if (!inserts.length) return false
    return {
        changes: inserts.map((at) => ({from: at, to: at, insert: [Leaf.text(INDENT)]})),
        selection: EditorSelection.Text.create({
            anchor: shift(selection.anchor, inserts),
            head: shift(selection.head, inserts),
            headSide: selection.headSide,
            goalColumn: selection.goalColumn,
            marks: selection.marks,
        }),
        userEvent: "input.indent",
        scrollIntoView: true,
    }
}

export const outdentCodeBlock: Command.Pure = ({state}) => {
    let found = codeTextblock(state)
    if (!found) return false
    let {block, selection} = found
    let lines = linesIn(block)
    let cuts: {from: number; to: number}[] = []
    if (selection.empty) {
        let line = lineAt(lines, selection.head)
        if (!line) return false
        let cut: {from: number; to: number} | null = null
        if (inLeadingSpace(line, selection.head)) cut = leadingCut(line)
        if (!cut) cut = cutBeforeCaret(line, selection.head)
        if (!cut) return false
        cuts.push(cut)
    } else {
        for (let line of lines) {
            if (!lineOverlaps(line, selection.from, selection.to)) continue
            let cut = leadingCut(line)
            if (cut) cuts.push(cut)
        }
        if (!cuts.length) return false
    }
    return {
        changes: cuts,
        selection: (cx, changes) => selection.map(changes, cx),
        userEvent: "input.outdent",
        scrollIntoView: true,
    }
}
