/**
 * Produce the next local update to send to the authority.
 *
 * {@link collab.sendableUpdate} is pure: it never mutates field state. When
 * the payload comes from `openUpdate`, the returned `promote` transaction
 * installs it as `nextUpdate` so further local edits accumulate separately.
 * Callers must apply `promote` (when present) before further edits.
 */
import type {EditorState, Transaction} from "@arrisa/state"
import {collabField, collabPromote} from "./field"
import {getClientID} from "./queries"
import type {CollabUpdate} from "./update"

/** Result of {@link sendableUpdate}: payload plus optional promote transaction. */
export type SendableResult = {
    update: CollabUpdate
    /**
     * Spec that promotes open → next. Empty when `nextUpdate` is already set
     * (idempotent re-read). Apply before further local edits.
     */
    promote: Transaction.Spec
}

/**
 * Return the local update that should be sent next, or `null` when fully synced.
 *
 * - If `nextUpdate` is already set (prior send still unacked), return it again
 *   with an empty promote spec.
 * - Else if `openUpdate` is set, return it with a promote effect that moves
 *   open → next via a normal field update.
 * - Else return `null`.
 */
export function sendableUpdate(state: EditorState): SendableResult | null {
    let field = state.field(collabField)
    let pending = field.nextUpdate ?? field.openUpdate
    if (!pending) return null

    let update: CollabUpdate = {
        version: field.version,
        clientID: getClientID(state),
        changes: pending.changes,
        effects: pending.effects,
    }
    // Promote only when the payload is still in open (not yet next).
    let promote: Transaction.Spec = field.nextUpdate
        ? {}
        : {effects: collabPromote.of(null)}
    return {update, promote}
}

/** True when there is an in-flight (`next`) or unsent (`open`) local update. */
export function hasUnsentUpdate(state: EditorState): boolean {
    let field = state.field(collabField)
    return !!(field.nextUpdate || field.openUpdate)
}
