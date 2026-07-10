/**
 * Editor update object passed to plugins and update listeners.
 */
import {ChangeSet} from "@arrisa/doc"
import type {EditorState, Transaction} from "@arrisa/state"
import {UpdateFlag} from "../view"
import type {Arrisa} from "./arrisa"

/// Editor {@link Arrisa.Plugin plugins} and {@link
/// Arrisa.updateListener update listeners} are given instances of
/// this class whenever the editor is updated.
export class Update {
    /// The changes made to the document by this update.
    readonly changes: ChangeSet

    private constructor(
        /// The editor that the update is associated with.
        readonly editor: Arrisa,
        /// The previous editor state.
        readonly startState: EditorState,
        /// The new editor state.
        readonly state: EditorState,
        /// The transactions involved in the update. May be empty.
        readonly transactions: readonly Transaction[],
        /// @internal
        public flags: number,
    ) {
        if (transactions.length) {
            this.changes = transactions[0].changes
            for (let i = 1; i < transactions.length; i++) this.changes = this.changes.compose(transactions[i].changes)
        } else {
            this.changes = ChangeSet.empty(startState.doc.length)
        }
    }

    /// True when the document was modified or editor geometry changed.
    get geometryChanged() {
        return this.docChanged || (this.flags & UpdateFlag.Geometry) > 0
    }

    /// True when this update indicates a focus change.
    get focusChanged() {
        return (this.flags & UpdateFlag.Focus) > 0
    }

    /// Whether the document changed in this update.
    get docChanged() {
        return !this.changes.empty
    }

    /// Whether the selection was explicitly set in this update.
    get selectionSet() {
        return this.transactions.some((tr) => tr.selection)
    }

    /// @internal
    get empty() {
        return this.flags == 0 && this.transactions.length == 0
    }

    /// @internal
    static create(
        editor: Arrisa,
        startState: EditorState,
        state: EditorState,
        transactions: readonly Transaction[],
        flags = 0,
    ) {
        return new Update(editor, startState, state, transactions, flags)
    }
}
