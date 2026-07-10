/**
 * Local (not yet authority-confirmed) change bundle for the collab pipeline.
 *
 * A local update is pure OT data: a {@link ChangeSet} plus any effects selected
 * by {@link CollabConfig.sharedEffects}. Composition and concurrent mapping
 * keep effects aligned with the complementary half of {@link ChangeSet.transform}.
 */
import {ChangeSet, type Plot} from "@arrisa/doc"
import {Transaction} from "@arrisa/state"

/** One local change batch (in-flight or still open). */
export class LocalUpdate {
    constructor(
        readonly changes: ChangeSet,
        readonly effects: readonly Transaction.Effect<unknown>[],
    ) {}
}

/**
 * Compose `changes`/`effects` onto an existing local update (or start one).
 * Returns `to` unchanged when both the new changes and effects are empty.
 */
export function addUpdate(
    to: LocalUpdate | null,
    changes: ChangeSet,
    effects: readonly Transaction.Effect<unknown>[] = [],
) {
    if (changes.empty && !effects.length) return to
    if (!to) return new LocalUpdate(changes, effects)
    return new LocalUpdate(
        to.changes.compose(changes),
        Transaction.Effect.mapEffects(to.effects, changes).concat(effects),
    )
}

/**
 * Rebase an open local update over concurrent changes `over`.
 *
 * `ChangeSet.transform(doc, over, update.changes)` yields:
 * - `a` — `over` mapped through the local update (applied to the live doc)
 * - `b` — local update mapped through `over` (kept as the new open update)
 *
 * Effects on the open update are mapped with `a` so they stay on the document
 * positions that remain after the concurrent remote (or correction) lands.
 * Returns the remapped open update and `accum` composed with `a`.
 */
export function mapOpenUpdate(update: LocalUpdate, doc: Plot.Doc, over: ChangeSet, accum: ChangeSet) {
    let {a, b} = ChangeSet.transform(doc, over, update.changes)
    return [new LocalUpdate(b, Transaction.Effect.mapEffects(update.effects, a)), accum.compose(a)] as const
}
