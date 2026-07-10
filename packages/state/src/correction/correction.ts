/**
 * Document corrections: automatic structural fixes after local edits.
 *
 * A correction pairs a node query with a callback that may return a
 * {@link ChangeSet.Spec}. Corrections register as `Transaction.extender`s so
 * each local (non-remote) document change is scanned once; matching nodes are
 * re-corrected and the resulting changes are applied sequentially after the
 * original transaction.
 *
 * Event kinds (see {@link CorrectionEvent}):
 * - **ChildList** — parent plot whose direct children changed
 * - **Content** — any ancestor plot whose content was touched
 * - **Marks** — nodes whose mark set was modified (or replaced text)
 *
 * {@link Correction.check} is a pure offline helper; {@link Correction.scan}
 * runs a full-document pass (e.g. after load).
 */
import {ChangeSet, type Node, type Plot, type Pos} from "@arrisa/doc"
import {EditorState} from "../state"
import type {Extension} from "../state/extension"
import {Transaction} from "../transaction"
import {CorrectionEvent, type PlanElt, scanChanges} from "./scan"

const corrections = EditorState.Facet.define<Correction>()

/** Per-transaction plan so multiple corrections share one `scanChanges` pass. */
const planCache = new WeakMap<Transaction, PlanElt[]>()

export class Correction {
    extension: Extension

    private constructor(
        readonly event: CorrectionEvent,
        readonly query: Node.Query,
        readonly correct: (node: Pos.Node) => ChangeSet.Spec | null,
    ) {
        this.extension = [corrections.of(this as any), Transaction.extender.of((tr) => this.extend(tr))]
    }

    /** Fire when a matching plot’s direct child list may have changed. */
    static onChildList(query: Node.Query, correct: (node: Pos.Plot) => ChangeSet.Spec | null) {
        return new Correction(CorrectionEvent.ChildList, query, correct as (node: Pos.Node) => ChangeSet.Spec | null)
    }

    /** Fire for matching ancestor plots whose content was touched by a replace. */
    static onContent(query: Node.Query, correct: (node: Pos.Plot) => ChangeSet.Spec | null) {
        return new Correction(CorrectionEvent.Content, query, correct as (node: Pos.Node) => ChangeSet.Spec | null)
    }

    /** Fire for matching nodes whose marks changed (keep sections with mods). */
    static onMarks(query: Node.Query, correct: (node: Pos.Node) => ChangeSet.Spec | null) {
        return new Correction(CorrectionEvent.Marks, query, correct)
    }

    /**
     * Offline: scan `changes` against `doc` and compose all non-null corrections.
     * Returns null when nothing matches or no corrector produced changes.
     */
    static check(changes: ChangeSet, doc: Plot.Doc, list: readonly Correction[]) {
        if (!list.length || changes.empty) return null
        let plan = scanChanges(changes, doc, list),
            changed: ChangeSet.Spec[] = []
        for (let c of list)
            for (let elt of plan)
                if (elt.correction == c) {
                    let change = c.correct(elt.node)
                    if (change) changed.push(change)
                }
        return changed.length ? ChangeSet.create(doc, changed) : null
    }

    /**
     * Transaction extender: skip remote/empty edits; reuse the shared plan;
     * return sequential changes so they apply after the base edit.
     */
    extend(tr: Transaction) {
        if (!tr.docChanged || tr.annotation(Transaction.remote)) return null
        let plan = planCache.get(tr)
        if (!plan) planCache.set(tr, (plan = scanChanges(tr.changes, tr.newDoc, tr.startState.facet(corrections))))
        let changes: ChangeSet.Spec[] = []
        for (let elt of plan)
            if (elt.correction == this) {
                let change = this.correct(elt.node)
                if (change) changes.push(change)
            }
        return changes.length ? {changes, sequential: true} : null
    }

    /** Full-document scan (not change-scoped). Returns an update transaction or null. */
    scan(state: EditorState) {
        let changes: ChangeSet.Spec[] = []
        state.doc.iterate((node, pos) => {
            if (state.schema.matchNode(node.type, this.query) && (this.event == CorrectionEvent.Marks || node.isPlot)) {
                let change = this.correct(state.doc.resolveNode(pos)!)
                if (change) changes.push(change)
            }
        })
        if (changes.length) return state.update({changes})
        return null
    }
}
