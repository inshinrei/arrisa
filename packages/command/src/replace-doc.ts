/**
 * Replace the entire document content without recording history.
 */
import {type Plot} from "@arrisa/doc"
import {EditorSelection, Transaction} from "@arrisa/state"
import {type Command} from "./command"

/** Replace `0..doc.length` with `next` content; cursor near start; no history. */
export const replaceDoc: Command.Pure<Plot.Doc> = ({state}, next) => {
    return {
        changes: {from: 0, to: state.doc.length, insert: next.content as any, fit: true},
        selection: EditorSelection.cursor(Math.min(1, Math.max(0, next.length))),
        userEvent: "set.doc",
        annotations: Transaction.addToHistory.of(false),
    }
}
