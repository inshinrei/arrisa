/**
 * Shared fixtures for schema package unit tests (not public API).
 */
import {Leaf, Slice, type Plot} from "@arrisa/doc"
import {EditorSelection, EditorState, Transaction, type Transaction as Tr} from "@arrisa/state"

/** Create an editor state from schema package extensions. */
export function makeState(
    extensions: EditorState.Extension,
    options: {
        doc?: Plot.Doc
        selection?: number | EditorSelection
    } = {},
) {
    let selection =
        options.selection == null
            ? undefined
            : typeof options.selection == "number"
              ? EditorSelection.cursor(options.selection)
              : options.selection
    return EditorState.create({
        doc: options.doc,
        selection,
        config: extensions,
    })
}

export function apply(state: EditorState, spec: Tr.Spec) {
    return state.update(spec).state
}

/** Type a single character at the selection head and run append (input rules). */
export function typeAtEnd(state: EditorState, ch: string) {
    let head = state.selection.head
    let tr = state.update({
        changes: {from: head, to: head, insert: Slice.of([Leaf.text(ch)])},
        selection: EditorSelection.cursor(head + ch.length),
        userEvent: "input.type",
    })
    return Transaction.append(tr)
}
