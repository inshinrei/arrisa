/**
 * High-level delete commands composed from util delete/join helpers.
 */
import {EditorSelection} from "@arrisa/state"
import {type Command} from "./command"
import {
    deleteBackward,
    deleteEmptyTextblock,
    deleteForward,
    deleteSelection,
} from "./util/delete"
import {joinBackward, joinForward, joinListItems} from "./util/join"

/**
 * Delete selection, or one unit in `dir` (join across block boundaries, then
 * character, then empty textblock).
 */
export const deleteUnit: Command.Pure<"forward" | "backward"> = ({state}, dir) => {
    return (
        deleteSelection(state) ||
        (dir == "forward"
            ? joinForward(state) || deleteForward(state) || deleteEmptyTextblock(state, 1)
            : joinListItems(state) || joinBackward(state) || deleteBackward(state) || deleteEmptyTextblock(state, -1))
    )
}

/** Like {@link deleteUnit} but deletes a word when the selection is a cursor. */
export const deleteWord: Command.Pure<"forward" | "backward"> = ({state}, dir) => {
    return (
        deleteSelection(state) ||
        (dir == "forward"
            ? joinForward(state) || deleteForward(state, true) || deleteEmptyTextblock(state, 1)
            : joinListItems(state) ||
              joinBackward(state) ||
              deleteBackward(state, true) ||
              deleteEmptyTextblock(state, -1))
    )
}

/**
 * Delete from the cursor to the visual line boundary in `dir`.
 * Uses view line geometry via the target's `moveToLineBoundary`.
 */
export const deleteToLineEnd: Command<"forward" | "backward"> = (editor, dir) => {
    let tr = deleteSelection(editor.state),
        {selection} = editor.state
    if (tr) return tr
    if (!(selection instanceof EditorSelection.Text)) return false
    let end = editor.moveToLineBoundary(selection, dir == "forward")
    if (!end || end.head == selection.head) return false
    return {
        changes: {
            correct: dir == "forward" ? {from: selection.head, to: end.head} : {from: end.head, to: selection.head},
        },
        scrollIntoView: true,
        userEvent: "delete." + dir,
    }
}

/** Delete the visual line containing the cursor (selection first if non-empty). */
export const deleteLine: Command = (editor) => {
    let tr = deleteSelection(editor.state),
        {selection} = editor.state
    if (tr) return tr
    if (!(selection instanceof EditorSelection.Text)) return false
    let start = editor.moveToLineBoundary(selection, false),
        end = editor.moveToLineBoundary(selection, true)
    if (!start || !end || start.head >= end.head) return false
    return {
        changes: {correct: {from: start.head, to: end.head}},
        scrollIntoView: true,
        userEvent: "delete.line",
    }
}
