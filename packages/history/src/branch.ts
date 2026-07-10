/**
 * Linked-list undo/redo branch: each node holds inverted changes (and effects)
 * plus optional deferred mappings for non-history transactions that occurred
 * after the event was recorded.
 *
 * Mapping is deferred (ChangeSet + start doc) because Arrisa's tree document
 * model needs a concrete document to transform changes, unlike flat-text
 * ChangeDesc mapping.
 */
import {ChangeSet, type Plot} from "@arrisa/doc"
import {EditorSelection, type EditorState, Transaction} from "@arrisa/state"
import {conc} from "./event"

export class Branch {
    depth: number

    constructor(
        readonly changes: ChangeSet,
        readonly effects: readonly Transaction.Effect<any>[],
        /** Accumulated non-history mapping not yet applied to this event. */
        readonly mapped: {change: ChangeSet; doc: Plot.Doc} | null,
        readonly startSelection: EditorSelection,
        readonly next: Branch | null,
    ) {
        this.depth = depth(next) + 1
    }

    /** Join a newer inverted event into this one (same undo step). */
    addChanges(changes: ChangeSet, effects: readonly Transaction.Effect<any>[]) {
        return new Branch(
            changes.compose(this.changes),
            conc(Transaction.Effect.mapEffects(effects, this.changes), this.effects),
            null,
            this.startSelection,
            this.next,
        )
    }

    /**
     * Apply deferred mapping once, producing concrete changes/effects/selection
     * (or null if the event maps away entirely).
     */
    resolve(config: EditorState.Configuration): Branch | null {
        if (!this.mapped) return this
        let {
            mapped: {change, doc},
            next,
        } = this
        let {a: mappedMapping, b: mappedChanges} = ChangeSet.transform(doc, change, this.changes)
        if (next) next = next.addMapping(mappedMapping, next.mapped ? null : this.changes.apply(doc))
        if (mappedChanges.empty && !this.effects.length) return next && next.resolve(config)
        let selDoc: Plot.Doc | undefined,
            selCx = {
                get doc() {
                    return selDoc || (selDoc = mappedChanges.apply(change.apply(doc)))
                },
                config,
            }
        return new Branch(
            mappedChanges,
            Transaction.Effect.mapEffects(this.effects, change),
            null,
            this.startSelection.map(mappedMapping, selCx),
            next,
        )
    }

    /** Resolve every node in the chain (used for JSON serialization). */
    resolveFully(config: EditorState.Configuration): Branch | null {
        let stack: Branch[] = []
        for (let head: Branch | null = this; head; head = head.next) {
            head = head.resolve(config)
            if (!head) break
            stack.push(head)
        }
        let result: Branch | null = null
        for (let i = stack.length - 1; i >= 0; i--) {
            let next = stack[i]
            if (next.next == result) result = next
            else result = new Branch(next.changes, next.effects, null, next.startSelection, result)
        }
        return result
    }

    /**
     * Record a non-history change that must map this event (and below) when
     * next resolved. Composes into existing deferred mapping when present.
     */
    addMapping(change: ChangeSet, startDoc: Plot.Doc | null) {
        return new Branch(
            this.changes,
            this.effects,
            this.mapped
                ? {change: this.mapped.change.compose(change), doc: this.mapped.doc}
                : {change, doc: startDoc!},
            this.startSelection,
            this.next,
        )
    }

    /** Keep only the newest `depth` events (oldest dropped). */
    clip(depth: number) {
        let stack: Branch[] = []
        for (let i = 0, cur: Branch | null = this; i < depth && cur; i++, cur = cur.next) stack.push(cur)
        let result: Branch | null = null
        for (let i = stack.length - 1; i >= 0; i--) {
            let event = stack[i]
            result = new Branch(event.changes, event.effects, event.mapped, event.startSelection, result)
        }
        return result
    }
}

export function depth(branch: Branch | null | undefined) {
    return branch ? branch.depth : 0
}
