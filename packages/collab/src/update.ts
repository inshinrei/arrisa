/**
 * Wire types for collab updates exchanged with the authority.
 *
 * Effects on the wire are a trust boundary: peers can attach arbitrary
 * {@link Transaction.Effect}s. Clients drop remote effects by default
 * ({@link CollabConfig.filterRemoteEffects}); authorities should strip
 * privileged effects before broadcast via {@link filterUpdateEffects}.
 */
import type {ChangeSet} from "@arrisa/doc"
import type {Transaction} from "@arrisa/state"

/**
 * One versioned change batch attributed to a client.
 *
 * `version` is the authority version this update applies *to* (the base before
 * the update). After acceptance the authority's version becomes `version + 1`.
 */
export interface CollabUpdate {
    version: number
    clientID: string
    changes: ChangeSet
    effects?: readonly Transaction.Effect<unknown>[]
}

/**
 * Authority helper: keep only effects matching `pred` on a wire update.
 */
export function filterUpdateEffects(
    update: CollabUpdate,
    pred: (effect: Transaction.Effect<unknown>) => boolean,
): CollabUpdate {
    if (!update.effects || !update.effects.length) return update
    let effects = update.effects.filter(pred)
    if (effects.length == update.effects.length) return update
    return effects.length ? {...update, effects} : {version: update.version, clientID: update.clientID, changes: update.changes}
}
