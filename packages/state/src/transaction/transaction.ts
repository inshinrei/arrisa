/**
 * Transactions: a change set plus optional selection, effects, and annotations
 * derived from a start {@link EditorState}.
 *
 * Construction is pure; applying to produce a new state is lazy via
 * {@link Transaction.state} (calls `startState.applyTransaction`).
 *
 * Facet hooks:
 * - **`extender`** — mutate/extend a single transaction before apply
 * - **`appender`** — after apply, optionally emit follow-up transactions
 */
import {type ChangeSet, type Plot} from "@arrisa/doc"
import type {EditorState} from "../state/state"
import type {Facet} from "../state/facet"
import {EditorSelection} from "../selection"
import {
    Annotation as Annotation_,
    time as time_,
    userEvent as userEvent_,
    addToHistory as addToHistory_,
    remote as remote_,
    appended as appended_,
} from "./annotation"
import {Effect as Effect_} from "./effect"
import {
    type ResolvedSpec,
    resolveTransactionInner,
    mergeTransaction,
} from "./resolve"
import {installTransactionFacets} from "./install-facets"

export class Transaction {
    /**
     * Facet: pure functions that may extend a transaction before apply.
     * Installed on the package entry (`src/index.ts`) so tree-shaking cannot
     * drop it and Facet is fully initialized (facet↔slot cycle).
     */
    static extender: Facet<(tr: Transaction) => Transaction.Spec | null>

    /**
     * Facet: after apply, may append further transactions (e.g. input rules).
     * Installed on the package entry (`src/index.ts`) — see {@link extender}.
     */
    static appender: Facet<(trs: readonly Transaction[], state: EditorState) => Transaction.Spec | null>

    newSelection: EditorSelection
    newDoc: Plot.Doc
    private constructor(
        readonly startState: EditorState,
        readonly changes: ChangeSet,
        readonly selection: EditorSelection | undefined,
        readonly effects: readonly Effect_<any>[],
        readonly annotations: readonly Annotation_<any>[],
        readonly scrollIntoView: boolean,
    ) {
        // Ensure every transaction has a creation timestamp.
        if (!annotations.some((a: Annotation_<any>) => a.type == time_))
            this.annotations = annotations.concat(time_.of(Date.now()))
        this.newDoc = this.changes.apply(this.startState.doc)
        this.newSelection =
            selection || startState.selection.map(changes, {doc: this.newDoc, config: this.startState.config})
        this.newSelection.check(startState.config, this.newDoc)
    }

    /** Filled by {@link EditorState.applyTransaction}; prefer {@link state}. */
    _state: EditorState | null = null

    /**
     * Resulting state after applying this transaction (computed once).
     * Triggers `startState.applyTransaction(this)` on first access.
     */
    get state() {
        if (!this._state) this.startState.applyTransaction(this)
        return this._state!
    }

    get docChanged(): boolean {
        return !this.changes.empty
    }

    /** True when applying this transaction produced a new configuration. */
    get reconfigured(): boolean {
        return this.startState.config != this.state.config
    }

    static create(startState: EditorState, spec: ResolvedSpec) {
        return new Transaction(
            startState,
            spec.changes,
            spec.selection,
            spec.effects,
            spec.annotations,
            spec.scrollIntoView,
        )
    }

    /** First annotation value of `type`, if present. */
    annotation<T>(type: Annotation_.Type<T>): T | undefined {
        for (let ann of this.annotations) if (ann.type == type) return ann.value
        return undefined
    }

    /**
     * Whether `userEvent` matches `event` exactly or as a dotted prefix
     * (`"input"` matches `"input.type"`).
     */
    isUserEvent(event: string): boolean {
        let e = this.annotation(userEvent_)
        return !!(e && (e == event || (e.length > event.length && e.startsWith(event) && e[event.length] == ".")))
    }
}

export namespace Transaction {
    export interface Spec {
        changes?: ChangeSet.Spec
        selection?:
            | EditorSelection
            | EditorSelection.Text.Spec
            | ((cx: EditorSelection.Context, changes: ChangeSet) => EditorSelection | null)
        effects?: Effect_<any> | readonly Effect_<any>[]
        annotations?: Annotation_<any> | readonly Annotation_<any>[]
        userEvent?: string
        scrollIntoView?: boolean
        /** When true with a prior change set, this spec is authored after it. */
        sequential?: boolean
    }

    /** Merge two unresolved specs as sequential updates on `state`. */
    export function merge(state: EditorState, a: Spec, b: Spec): Spec {
        let rA = resolveTransactionInner(state, null, a)
        return mergeTransaction(state, rA, resolveTransactionInner(state, rA.changes, b))
    }

    /**
     * Run appenders until fixed point. Each appender is fed only the
     * transactions it has not yet seen; appended specs get {@link appended}.
     */
    export function append(tr: Transaction): readonly Transaction[] {
        installTransactionFacets()
        let result = [tr],
            top = tr.state
        let appenders = tr.startState.facet(Transaction.appender)
        if (!appenders.length) return result
        for (let seen = appenders.map(() => 0); ;) {
            let done = true
            for (let i = 0; i < appenders.length; i++) {
                let from = seen[i]
                if (from < result.length) {
                    let add = appenders[i](from ? result.slice(from) : result, top)
                    if (add) {
                        let next = top.update(Transaction.merge(top, add, {annotations: appended_.of(true)}))
                        result.push(next)
                        top = next.state
                        done = false
                    }
                    seen[i] = result.length
                }
            }
            if (done) return result
        }
    }

    // Annotation / Effect carry nested Type / Spec namespaces
    export import Annotation = Annotation_
    export import Effect = Effect_
    export const time = time_
    export const userEvent = userEvent_
    export const addToHistory = addToHistory_
    export const remote = remote_
    export const appended = appended_
}
