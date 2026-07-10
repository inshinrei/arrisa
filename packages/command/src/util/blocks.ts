/**
 * Low-level block structure helpers: join, fit, and auto-join after changes.
 */
import {ChangeSet, Leaf, type Node, Plot, type Pos, type Schema, type Token} from "@arrisa/doc"
import {type EditorState, Transaction} from "@arrisa/state"

/** Default textblock tag that can wrap text under `type`, if any. */
export function textblockChild(schema: Schema, type: Plot.Type) {
    let wrap = schema.findWrapping(type, Leaf.Text)
    return wrap && wrap.length == 1 ? wrap[0] : null
}

/** Delete children of `node` that `type` cannot contain. */
export function clearNonFitting(schema: Schema, node: Pos.Plot, type: Plot.Type): ChangeSet.Spec {
    let changes: ChangeSet.Spec[] = []
    for (let i = 0, pos = node.start; i < node.node.content.length; i++) {
        let child = node.node.content[i],
            end = pos + child.length
        if (!schema.canContain(type, child.type)) changes.push({from: pos, to: end})
        pos = end
    }
    return changes
}

/**
 * Join two adjacent textblocks, adjusting open/close tokens when depths differ
 * and optionally auto-joining matching context wrappers.
 */
export function joinBlocks(before: Pos.Plot, after: Pos.Plot): ChangeSet.Spec {
    let changes: ChangeSet.Spec[] = [{from: before.end, to: after.start}]
    let dBefore = before.depth,
        dAfter = after.depth
    let tokensAfter: Token[] = [],
        posAfter = after.after,
        end = posAfter
    if (dBefore > dAfter) {
        let extraContext: Plot.Tag[] = []
        for (let i = dBefore - dAfter, level = before.parent!; i > 0; i--, level = level.parent!)
            extraContext.push(level.node.tag)
        let nodeAfter = after.nextSibling
        for (let i = dBefore - dAfter - 1, joining = true; i >= 0; i--) {
            let context = extraContext[i]
            if (
                !joining ||
                !nodeAfter ||
                nodeAfter.isLeaf ||
                nodeAfter.type != context.type ||
                !context.type.spec.autoJoin ||
                (typeof context.type.spec.autoJoin == "function" && !context.type.spec.autoJoin(context, nodeAfter.tag))
            )
                joining = false
            if (joining) end++
            else tokensAfter.push(Plot.End)
        }
    } else if (dAfter > dBefore) {
        for (let i = dAfter - dBefore, level = after, atEnd = true; i > 0; i--, level = level.parent!) {
            if (level.nextSibling) atEnd = false
            if (atEnd) end++
            else tokensAfter.push(level.parent!.node.tag)
        }
    }
    if (tokensAfter.length || end > posAfter) changes.push({from: posAfter, to: end, insert: tokensAfter})
    return changes
}

/**
 * After applying `tr.changes`, join adjacent same-type blocks whose types have
 * `autoJoin` enabled (recursively into nested open/close pairs).
 */
export function autoJoinBlocks(state: EditorState, tr: Transaction.Spec): Transaction.Spec {
    if (!tr.changes) return tr
    let changes = ChangeSet.create(state.doc, tr.changes),
        doc = changes.apply(state.doc)
    if (changes.empty) return tr
    let append: ChangeSet.Spec[] = []
    let cursor = doc.resolve(0),
        check = (pos: number) => {
            cursor = cursor.advance(pos - cursor.pos)
            let before = cursor.nodeBefore,
                after = cursor.nodeAfter
            if (before && after && before.isPlot && before.type.isBlock && after.isPlot && after.type == before.type) {
                let {autoJoin} = after.type.spec
                if (autoJoin && (typeof autoJoin != "function" || autoJoin(before.tag, after.tag))) {
                    let from = pos - 1,
                        to = pos + 1
                    for (;;) {
                        let last: Node | null = before!.lastChild,
                            first: Node | null = after!.firstChild
                        if (
                            !first ||
                            !last ||
                            first.isLeaf ||
                            last.isLeaf ||
                            first.type != last.type ||
                            first.type.isInline
                        )
                            break
                        autoJoin = last.type.spec.autoJoin
                        if (!autoJoin || (typeof autoJoin == "function" && !autoJoin(last.tag, first.tag))) break
                        ;(from--, to++)
                        before = last
                        after = first
                    }
                    append.push({from, to})
                }
            }
        }

    changes.iterGaps(
        () => {},
        (_fromA, _toA, fromB, toB) => {
            check(fromB)
            if (toB > fromB) check(toB)
        },
    )
    if (!append.length) return {...tr, changes}
    return Transaction.merge(state, tr, {changes: append, sequential: true})
}
