/**
 * Pure undo/redo commands and depth queries.
 *
 * Commands return a {@link Transaction.Spec} for the caller to apply (or false
 * when the action is unavailable). They do not dispatch on their own.
 */
import {type EditorState, type Transaction} from "@arrisa/state"
import {depth} from "./branch"
import {historyField_} from "./field"
import {BranchName} from "./meta"

/** Returns a transaction spec to apply, or false if inapplicable. */
export type HistoryCommand = (cx: {state: EditorState}) => Transaction.Spec | false

/** Undo one group of history events. */
export const undo: HistoryCommand = ({state}) => {
    let historyState = state.field(historyField_, false)
    if (state.readOnly || !historyState) return false
    return historyState.pop(BranchName.Done, state)
}

/** Redo one group of history events. */
export const redo: HistoryCommand = ({state}) => {
    let historyState = state.field(historyField_, false)
    if (state.readOnly || !historyState) return false
    return historyState.pop(BranchName.Undone, state)
}

/** Number of undoable change groups in `state`. */
export const undoDepth = (state: EditorState) => depth(state.field(historyField_, false)?.done)

/** Number of redoable change groups in `state`. */
export const redoDepth = (state: EditorState) => depth(state.field(historyField_, false)?.undone)
