/**
 * Resolve {@link Transaction.Spec} values into concrete change sets, selection
 * updates, effects, and annotations — including concurrent mapping when a
 * prior change set is present (`after`).
 *
 * - **`sequential`**: specs are authored against the doc after `after`.
 * - **non-sequential**: specs are concurrent with `after` and must be
 *   transformed (`ChangeSet.transform`) before merge.
 */
import {ChangeSet, type Plot} from "@arrisa/doc"
import type {EditorState} from "../state/state"
import type {Configuration} from "../state/configuration"
import {EditorSelection} from "../selection"
import {Transaction} from "./transaction"
import {installTransactionFacets} from "./install-facets"
import {Effect} from "./effect"
import {userEvent} from "./annotation"

export type ResolvedSpec = {
    changes: ChangeSet
    selection: EditorSelection | undefined
    effects: readonly Effect<any>[]
    annotations: readonly import("./annotation").Annotation<any>[]
    scrollIntoView: boolean
}

/** Lazy selection context: applies `changes` only when `.doc` is read. */
function selCx(config: Configuration, doc: Plot.Doc, changes: ChangeSet) {
    let newDoc: Plot.Doc | undefined
    return {
        get doc() {
            return newDoc || (newDoc = changes.apply(doc))
        },
        config,
    }
}

/** Compose two resolved specs: changes compose; effects map then concat. */
export function mergeTransaction(state: EditorState, a: ResolvedSpec, b: ResolvedSpec): ResolvedSpec {
    let changes = a.changes.compose(b.changes)
    return {
        changes,
        selection: b.selection || (a.selection && a.selection.map(b.changes, selCx(state.config, state.doc, changes))),
        effects: Effect.mapEffects(a.effects, b.changes).concat(b.effects),
        annotations: a.annotations.length ? a.annotations.concat(b.annotations) : b.annotations,
        scrollIntoView: a.scrollIntoView || b.scrollIntoView,
    }
}

/** Resolve one spec, optionally relative to a prior change set `after`. */
export function resolveTransactionInner(
    state: EditorState,
    after: ChangeSet | null,
    spec: Transaction.Spec,
): ResolvedSpec {
    let {changes, sequential} = spec
    if (after && after.empty) after = null
    let doc = after && sequential ? after.apply(state.doc) : state.doc
    if (!(changes instanceof ChangeSet)) changes = ChangeSet.create(doc, changes || [])
    let effects = asArray(spec.effects),
        annotations = asArray(spec.annotations)
    if (spec.userEvent) annotations = annotations.concat(userEvent.of(spec.userEvent))
    let selection = !spec.selection
        ? undefined
        : spec.selection instanceof EditorSelection
          ? spec.selection
          : typeof spec.selection == "function"
            ? (spec.selection({doc: changes.apply(doc), config: state.config}, changes) ?? undefined)
            : EditorSelection.Text.create(spec.selection)
    if (after && !sequential) {
        if (selection) {
            let {a, b} = ChangeSet.transform(state.doc, after, changes)
            selection = selection.map(a, selCx(state.config, doc, changes))
            changes = b
        } else {
            changes = changes.transform(state.doc, after)
        }
        effects = Effect.mapEffects(effects, after)
    }
    return {changes, selection, effects, annotations, scrollIntoView: !!spec.scrollIntoView}
}

/**
 * Build a transaction from a spec, then fold {@link Transaction.extender}
 * facets (highest priority last in the facet list → applied first here).
 */
export function resolveTransaction(state: EditorState, spec: Transaction.Spec): Transaction {
    installTransactionFacets()
    let s = resolveTransactionInner(state, null, spec)
    let extenders = state.facet(Transaction.extender),
        tr = Transaction.create(state, s)
    for (let i = extenders.length - 1; i >= 0; i--) {
        let extension = extenders[i](tr)
        if (extension) {
            s = mergeTransaction(state, s, resolveTransactionInner(state, tr.changes, extension))
            tr = Transaction.create(state, s)
        }
    }
    return tr
}

let none: readonly any[] = []

/** Normalize `undefined | T | T[]` to a readonly array (shared empty). */
export function asArray<T>(value: undefined | T | readonly T[]): readonly T[] {
    return value == null ? none : Array.isArray(value) ? value : [value as T]
}
