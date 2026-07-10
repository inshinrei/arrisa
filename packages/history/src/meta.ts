/**
 * Shared history annotations, facets, and branch identity used across modules.
 *
 * Kept separate from the public `history` namespace so field update and event
 * helpers can import them without circular dependencies on the extension entry.
 */
import type {ChangeSet} from "@arrisa/doc"
import {EditorState, Transaction} from "@arrisa/state"
import type {Branch} from "./branch"

/** Which side of history an undo/redo transaction came from. */
export const enum BranchName {
    Done,
    Undone,
}

/**
 * Marks transactions produced by undo/redo so the field can move events between
 * the done and undone branches instead of recording them as new edits.
 */
export const fromHistory = Transaction.Annotation.define<{side: BranchName; rest: Branch | null}>()

/**
 * Prevents adjacent transactions from being joined into one undo event.
 * - `"before"`: isolate from the previous event
 * - `"after"`: isolate from the next event
 * - `"full"`: both sides
 */
export const isolate = Transaction.Annotation.define<"before" | "after" | "full">()

/**
 * Register functions that, given a transaction, return inverted effects to
 * store with the history event so those effects can be undone/redone.
 */
export const invertedEffects = EditorState.Facet.define<(tr: Transaction) => readonly Transaction.Effect<any>[]>()

export type EventJSON = {
    changes: ChangeSet.JSON
    selection: unknown
}

export type HistoryJSON = {
    done: readonly EventJSON[]
    undone: readonly EventJSON[]
}
