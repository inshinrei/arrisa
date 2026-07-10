/**
 * Authority-side rebase: move a client update over already-accepted updates.
 *
 * Used when a client submits against a stale version. Concurrent updates from
 * other clients are applied first; an update from the same `clientID` means the
 * authority already accepted that batch, so the candidate is dropped (`null`).
 */
import type {ChangeSet, Plot} from "@arrisa/doc"
import {Correction, Transaction} from "@arrisa/state"
import type {CollabUpdate} from "./update"

/**
 * Rebase `update` over already-accepted `over` entries (each with the doc that
 * entry applied to, its changes, and client id). Optionally run `corrections`
 * on the rebased result so structure rules match client receive.
 */
export function transformUpdate(
    update: CollabUpdate,
    over: readonly {doc: Plot.Doc; changes: ChangeSet; clientID: string}[],
    corrections?: readonly Correction[],
): CollabUpdate | null {
    if (!over.length) return update
    let {clientID, version, changes, effects} = update
    for (let other of over) {
        // Same client already accepted this step — drop as duplicate.
        if (other.clientID == clientID) return null
        if (effects && effects.length)
            effects = Transaction.Effect.mapEffects(effects, other.changes.transform(other.doc, changes, true))
        changes = changes.transform(other.doc, other.changes)
        version++
    }
    if (corrections && corrections.length) {
        // Corrections apply against the doc after the last concurrent update.
        let corrected = Correction.check(changes, changes.apply(over[over.length - 1].doc), corrections)
        if (corrected) {
            changes = changes.compose(corrected)
            if (effects) effects = Transaction.Effect.mapEffects(effects, corrected)
        }
    }
    return {clientID, version, changes, effects}
}
