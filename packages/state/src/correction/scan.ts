/**
 * Plan which corrections apply to a change set on a post-change document.
 *
 * ChangeSet sections (`[lenA, ins, …]`):
 * - `ins == -1` — plain keep (skip)
 * - `ins == -2` — keep with mark modifications (Marks corrections walk the span)
 * - `ins >= 0` — replace `lenA` with `ins` new content (Content / ChildList /
 *   inserted plots via walkers)
 *
 * Parent queries use `queried` with key `parent.start - 1` so they do not
 * collide with node positions (which use absolute `pos`). Mark walks may remap
 * a text leaf when the parent content was replaced but the mark walker still
 * lands on an old offset inside that parent.
 */
import {type ChangeSet, type Node, type Plot, Pos} from "@arrisa/doc"
import type {Correction} from "./correction"

export const enum CorrectionEvent {
    ChildList = 0,
    Content = 1,
    Marks = 2,
}

export type PlanElt = {node: Pos.Node; correction: Correction}

export function scanChanges(changes: ChangeSet, doc: Plot.Doc, corrections: readonly Correction[]) {
    // Buckets indexed by CorrectionEvent
    let buckets: Correction[][] = [[], [], []],
        [childList, content, marks] = buckets
    for (let c of corrections) buckets[c.event].push(c)

    let plan: PlanElt[] = []
    let queried: Set<number> = new Set(),
        newNode = childList.concat(content)
    let updateWalker: Pos.Walker | undefined,
        {schema} = doc
    let checkMarks = (node: Node, pos: number, parent: Pos.Plot, index: number) => {
        for (let correction of marks)
            if (schema.matchNode(node.type, correction.query))
                plan.push({node: Pos.Node.create(parent, node, pos, index), correction})
    }
    if (marks.length)
        updateWalker = {
            enterPlot: checkMarks,
            skip(node: Node, pos: number, parent: Pos.Plot, index: number) {
                // Replaced text may still be visited at an old offset; remap to
                // the live leaf in the parent’s current content.
                if (node.isText && !parent.node.content.includes(node)) {
                    for (let off = parent.start, i = 0; ; i++) {
                        let next = parent.node.content[i],
                            end = off + next.length
                        if (end > pos) {
                            node = next
                            pos = off
                            break
                        }
                    }
                    if (queried.has(pos)) return
                    queried.add(pos)
                }
                checkMarks(node, pos, parent, index)
            },
            leavePlot() {},
        }
    let changeWalker: Pos.Walker = {
        enterPlot(node, pos, parent, index) {
            queried.add(pos)
            this.skip(node, pos, parent, index)
        },
        skip(node, pos, parent, index) {
            if (node.isPlot)
                for (let correction of newNode)
                    if (schema.matchNode(node.type, correction.query))
                        plan.push({node: Pos.Plot.create(parent, node, pos, index), correction})
        },
        leavePlot() {},
    }

    let pos = doc.resolve(0)
    for (let i = 0, {sections} = changes; i < sections.length; ) {
        let len = sections[i++],
            ins = sections[i++]
        if (ins == -1 || (ins == -2 && !updateWalker)) {
            // Plain keep, or mark-mod keep with no Marks corrections registered.
            if (i == sections.length) break
            pos = pos.advance(len)
        } else if (ins == -2) {
            // Coalesce consecutive mark-mod keeps and walk for Marks.
            while (i < sections.length && sections[i + 1] == -2) {
                len += sections[i++]
                i++
            }
            pos = pos.walk(len, updateWalker!)
        } else {
            // Replace span: coalesce adjacent replaces, then fire Content /
            // ChildList on ancestors and walk inserted content for new plots.
            while (i < sections.length && sections[i + 1] >= 0) {
                len += sections[i++]
                ins += sections[i++]
            }
            let start = pos.pos,
                end = start + ins
            for (let checkChildList = childList.length > 0, parent = pos.parent; ; ) {
                if (queried.has(parent.start - 1)) break
                queried.add(parent.start - 1)
                if (checkChildList) {
                    for (let correction of childList)
                        if (schema.matchNode(parent.node.type, correction.query)) plan.push({node: parent, correction})
                    // Child list only changes if the replace crosses a boundary
                    // of this parent; otherwise stop checking higher for ChildList.
                    if (start >= parent.start && end <= parent.end) checkChildList = false
                }
                for (let correction of content)
                    if (schema.matchNode(parent.node.type, correction.query)) plan.push({node: parent, correction})
                if (!parent.parent || (!content.length && !checkChildList)) break
                parent = parent.parent
            }
            pos = pos.walk(ins, changeWalker)
        }
    }
    return plan
}
