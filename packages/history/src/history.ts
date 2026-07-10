/**
 * Undo/redo history extension for Arrisa editor state.
 *
 * Install with {@link history}. Document changes (and optional inverted
 * effects) are stored as linked events; typing/deletes close in time may join
 * into a single undo step. Use {@link history.isolate} to force a boundary,
 * `Transaction.addToHistory` of `false` to edit without recording, and
 * {@link history.invertedEffects} to integrate custom effects.
 */
import {type EditorState, type Transaction} from "@arrisa/state"
import type {HistoryConfig} from "./config"
import {historyConfig} from "./config"
import {historyField_} from "./field"
import {
    isolate as isolate_,
    invertedEffects as invertedEffects_,
    type EventJSON as EventJSON_,
    type HistoryJSON,
} from "./meta"

/** Create a history extension with optional configuration. */
export function history(config: HistoryConfig = {}): EditorState.Extension {
    return [historyField_, historyConfig.of(config)]
}

export namespace history {
    /**
     * State field holding history data. Pass to
     * {@link EditorState.toJSON} / {@link EditorState.fromJSON} to preserve
     * undo stacks across serialization.
     */
    export const field = historyField_ as EditorState.Field<unknown>

    /**
     * Annotate a transaction so it does not join with neighbors in the undo
     * history (`"before"`, `"after"`, or `"full"`).
     */
    export const isolate: Transaction.Annotation.Type<"before" | "after" | "full"> = isolate_

    /**
     * Facet for functions that produce inverted effects to store (and restore)
     * with history events.
     */
    export const invertedEffects: EditorState.Facet<
        (tr: Transaction) => readonly Transaction.Effect<any>[]
    > = invertedEffects_

    export type EventJSON = EventJSON_
    export type JSON = HistoryJSON
}
