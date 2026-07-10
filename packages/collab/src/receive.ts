/**
 * Apply authority updates to a client editor state.
 *
 * Invariants:
 * - Updates must arrive in contiguous version order (`update.version == version`).
 * - An update with our `clientID` is an ack of `nextUpdate` and must match it
 *   (or match after a known correction recovery).
 * - Remote updates are OT-transformed over `nextUpdate` then `openUpdate`, and
 *   composed into the transaction that also installs the new {@link CollabState}.
 *
 * The resulting transaction is annotated `remote` + not added to history so
 * undo stacks and local corrections do not re-process peer edits.
 */
import {ChangeSet} from "@arrisa/doc"
import {Correction, type EditorState, Transaction} from "@arrisa/state"
import {CollabState} from "./collab-state"
import {collabConfig} from "./config"
import {collabField, collabReceive} from "./field"
import {LocalUpdate, addUpdate, mapOpenUpdate} from "./local-update"
import type {CollabUpdate} from "./update"

/**
 * Build a transaction that applies `updates` from the authority and advances
 * collab state. Callers should dispatch the returned transaction.
 */
export function receive(state: EditorState, updates: readonly CollabUpdate[]) {
    let {version, syncedDoc, nextUpdate, openUpdate} = state.field(collabField)
    let {clientID, corrections, filterRemoteEffects} = state.facet(collabConfig)

    let changes = ChangeSet.empty(state.doc.length)
    let effects: readonly Transaction.Effect<unknown>[] = []

    let haveRemote = false
    for (let update of updates) {
        if (update.version != version) throw new Error("Version mismatch in received collab update")

        if (update.clientID == clientID) {
            // ── Ack of our in-flight nextUpdate ─────────────────────────────
            if (!nextUpdate) throw new Error("Received unknown update with our client ID")
            // When nothing remapped the pipeline, synced content is just state.doc.
            syncedDoc = openUpdate || haveRemote ? nextUpdate.changes.apply(syncedDoc) : state.doc
            mismatch: if (!nextUpdate.changes.eq(update.changes)) {
                // Authority may have applied a correction we can recover locally.
                if (haveRemote && nextUpdate && corrections.length) {
                    let correct = Correction.check(nextUpdate.changes, syncedDoc, corrections)
                    if (correct && nextUpdate.changes.compose(correct).eq(update.changes)) {
                        if (openUpdate) [openUpdate, changes] = mapOpenUpdate(openUpdate, syncedDoc, correct, changes)
                        else changes = changes.compose(correct)
                        syncedDoc = correct.apply(syncedDoc)
                        break mismatch
                    }
                }
                throw new Error("Received update with our client ID doesn't match our own local update")
            }
            nextUpdate = null
        } else {
            // ── Remote peer update ──────────────────────────────────────────
            let newChanges = update.changes,
                newEffects = update.effects || []
            let baseDoc = syncedDoc
            // Transform over in-flight local send first, then over open edits.
            if (nextUpdate) {
                let {a, b} = ChangeSet.transform(baseDoc, newChanges, nextUpdate.changes)
                if (openUpdate) baseDoc = nextUpdate.changes.apply(baseDoc)
                nextUpdate = new LocalUpdate(b, Transaction.Effect.mapEffects(nextUpdate.effects, a))
                newChanges = a
                newEffects = Transaction.Effect.mapEffects(newEffects, b)
            }
            if (openUpdate) {
                let {a, b} = ChangeSet.transform(baseDoc, newChanges, openUpdate.changes)
                openUpdate = new LocalUpdate(b, Transaction.Effect.mapEffects(openUpdate.effects, a))
                newChanges = a
                newEffects = Transaction.Effect.mapEffects(newEffects, b)
            }
            // Trust boundary: remote effects must be explicitly allowlisted.
            newEffects = filterRemoteEffects(newEffects, update)
            changes = changes.compose(newChanges)
            effects = Transaction.Effect.mapEffects(effects, newChanges).concat(newEffects)
            syncedDoc = update.changes.apply(syncedDoc)
            haveRemote = true
        }
        version++
    }

    // After remotes land, re-run structure corrections on remaining local pipeline
    // so open/next stay valid against the new synced baseline.
    if (haveRemote && corrections.length) {
        let base = syncedDoc
        if (nextUpdate) {
            base = nextUpdate.changes.apply(base)
            let correct = Correction.check(nextUpdate.changes, base, corrections)
            if (correct) {
                nextUpdate = addUpdate(nextUpdate, correct)
                if (openUpdate) {
                    ;[openUpdate, changes] = mapOpenUpdate(openUpdate, base, correct, changes)
                    base = correct.apply(base)
                } else {
                    changes = changes.compose(correct)
                }
            }
        }
        if (openUpdate) {
            base = openUpdate.changes.apply(base)
            let correct = Correction.check(openUpdate.changes, base, corrections)
            if (correct) {
                openUpdate = addUpdate(openUpdate, correct)
                changes = changes.compose(correct)
            }
        }
    }

    return state.update({
        changes,
        effects: effects.concat(collabReceive.of(new CollabState(version, syncedDoc, nextUpdate, openUpdate))),
        annotations: [Transaction.addToHistory.of(false), Transaction.remote.of(true)],
    })
}
