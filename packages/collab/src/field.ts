/**
 * Collab state field and effects that install a new field value.
 *
 * Local transactions that change the doc (or carry shared effects) accumulate
 * into `openUpdate`. Remote sync replaces the whole field via {@link collabReceive}.
 * Promoting open → next for send uses {@link collabPromote} (no in-place mutation).
 */
import {EditorState, Transaction} from "@arrisa/state"
import {CollabState} from "./collab-state"
import {collabConfig} from "./config"
import {addUpdate} from "./local-update"

/**
 * Effect carrying the post-receive collab state. Its `map` folds concurrent
 * local changes into `openUpdate` when the receive transaction is itself mapped.
 */
export const collabReceive = Transaction.Effect.define<CollabState>({
    map(state, changes) {
        return changes.empty
            ? state
            : new CollabState(state.version, state.syncedDoc, state.nextUpdate, addUpdate(state.openUpdate, changes))
    },
})

/**
 * Promote `openUpdate` → `nextUpdate` when taking a sendable batch.
 * Idempotent if `nextUpdate` is already set or there is nothing open.
 */
export const collabPromote = Transaction.Effect.define<null>()

/** Field holding {@link CollabState}; create at `startVersion` with the initial doc. */
export const collabField = EditorState.Field.define({
    create(state) {
        return new CollabState(state.facet(collabConfig).startVersion, state.doc, null, null)
    },

    update(collab: CollabState, tr: Transaction) {
        // Receive path: authority sync installs a complete new state.
        for (let e of tr.effects) if (e.is(collabReceive)) return e.value

        // Promote path: open → next for single-inflight send (atomic field replace).
        for (let e of tr.effects) {
            if (e.is(collabPromote)) {
                if (collab.nextUpdate || !collab.openUpdate) return collab
                return new CollabState(collab.version, collab.syncedDoc, collab.openUpdate, null)
            }
        }

        // Local path: accumulate doc changes and shared effects into openUpdate.
        let {sharedEffects} = tr.startState.facet(collabConfig)
        let effects = sharedEffects(tr)
        if (effects.length || !tr.changes.empty)
            return new CollabState(
                collab.version,
                collab.syncedDoc,
                collab.nextUpdate,
                addUpdate(collab.openUpdate, tr.changes, effects),
            )
        return collab
    },
})
