/**
 * Cursor motion helpers for textblocks and block structure.
 *
 * - **Barriers** (`isBarrier`): isolating / atomic / whitespace-preserving
 *   plots and block leaves — motion can land on the boundary without entering.
 * - **`mustMove`**: when true, a scan may not return the start position
 *   (used for “next” steps); when false, landing on the current valid spot is ok.
 * - **Word skip**: walks cluster-by-cluster (visual or logical) within a
 *   textblock, then hops to the next textblock via {@link scanNormalFrom}.
 */
import {Leaf, type Node, Pos} from "@arrisa/doc"
import {findClusterBreak} from "../find-cluster-break"
import {TextblockMap} from "../textblock"
import type {EditorState} from "../state/state"
import type {EditorSelection as EditorSelectionType} from "./base"
import {Text} from "./text"

type Context = EditorSelectionType.Context

export function cursorAtStart(cx: Context, block?: Pos.Plot) {
    let found = block
        ? TextblockMap.get(block.start, block.node, cx.config.textblockLTR(block.node)).visualSide(true)
        : cx.doc.inlineContent
          ? TextblockMap.get(0, cx.doc, cx.config.textblockLTR(cx.doc)).visualSide(true)
          : (scanNormalFrom(cx, 0, 1, true, false) ?? {pos: 0, side: 1})
    return Text.createInner(found.pos, found.pos, found.side)
}

function isBarrier(node: Node) {
    if (node.isLeaf) return node.type.isBlock
    let override = node.type.spec.cursorBarrier
    if (override != null) return override
    return node.type.isolating || node.type.preserveWhitespace || (node.type.isBlock && node.type.isAtom)
}

/**
 * Find a valid text cursor starting from `from`/`side`.
 * Returns null only when the document has no legal cursor in that direction.
 */
export function scanNormalFrom(
    cx: Context,
    from: number,
    side: -1 | 1,
    forward: boolean,
    mustMove: boolean,
): {pos: number; side: -1 | 1} | null {
    let pos = cx.doc.resolve(from),
        pastBarrier = false
    if (pos.parent.node.inlineContent) {
        if (!mustMove) return {pos: pos.pos, side}
        let block = pos.textblockParent!
        let map = TextblockMap.get(block.start, block.node, cx.config.textblockLTR(block.node))
        let next = cx.config.visualCursorMotion
            ? map.moveVisually(pos.pos, side, forward)
            : map.moveLogically(pos.pos, forward)
        if (next != null) return next
        if (!block.parent) return null
        pos = Pos.create(block.parent, forward ? block.after : block.before, block.index + (forward ? 1 : 0), 0)
        pastBarrier = isBarrier(block.node)
    } else {
        pastBarrier = !pos.parent.parent && pos.index == (forward ? 0 : pos.parent.node.content.length)
        for (
            let {
                parent: {node},
                index,
            } = pos;
            !pastBarrier && (forward ? index : index < node.content.length);
        ) {
            let next = node.content[forward ? index - 1 : index]
            if (isBarrier(next)) pastBarrier = true
            if (next.isLeaf) {
                index += forward ? 1 : -1
            } else {
                if (next.inlineContent) break
                node = next
                index = forward ? next.content.length : 0
            }
        }
    }

    let bottom = pos.pos,
        step = forward ? 1 : -1
    for (let {parent, index} = pos, p = pos.pos; ;) {
        let {node, parent: next} = parent
        if (node.inlineContent) {
            if (cx.config.visualCursorMotion)
                return TextblockMap.get(parent.start, parent.node, cx.config.textblockLTR(parent.node)).visualSide(
                    forward,
                )
            return {pos: p, side: forward ? 1 : -1}
        }
        if (index == (forward ? node.content.length : 0)) {
            let barrier = !next || isBarrier(node)
            if ((bottom != from || !mustMove) && pastBarrier && barrier) return {pos: bottom, side: forward ? -1 : 1}
            if (!next) return null
            index = parent.index + (forward ? 1 : 0)
            parent = next
            p += step
            bottom = p
            if (barrier) pastBarrier = true
        } else {
            let nextNode = node.content[index - (forward ? 0 : 1)]
            let barrier = isBarrier(nextNode)
            if (pastBarrier && (bottom != from || !mustMove) && barrier) return {pos: bottom, side: forward ? -1 : 1}
            if (nextNode.isLeaf || nextNode.type.isAtom) {
                index += step
                p += nextNode.length * step
            } else {
                if (!forward) index--
                parent = Pos.Plot.create(parent, nextNode, forward ? p : p - nextNode.length, index)
                p += step
                index = forward ? 0 : nextNode.content.length
            }
            if (barrier) {
                pastBarrier = true
                bottom = p
            }
        }
    }
}

/** Skip one word from `start`/`side`, crossing textblock boundaries if needed. */
export function skipWord(cx: Context, start: number, side: -1 | 1, forward: boolean) {
    let last: {pos: number; side: -1 | 1} | null = null
    for (let pos = start, visually = cx.config.visualCursorMotion; ;) {
        let block = cx.doc.resolve(pos).textblockParent
        if (!block) {
            let next = scanNormalFrom(cx, pos, side, forward, true)
            if (!next) return last
            ;({pos, side} = next)
        } else {
            let map = TextblockMap.get(block.start, block.node, cx.config.textblockLTR(block.node))
            let next = map.skipWord(pos, side, forward, visually)
            if (next) return next
            if (!block.parent) return last
            let end: {pos: number; side: -1 | 1} = visually
                ? map.visualSide(!forward)
                : forward
                  ? {pos: block.end, side: -1}
                  : {pos: block.start, side: 1}
            if (end.pos != start) last = end
            pos = forward ? block.after : block.before
        }
    }
}

/**
 * Expand around `pos` to the Unicode word containing it (letters/numbers),
 * refined with `Intl.Segmenter` when available.
 */
export function wordAt(state: EditorState, pos: number, bias: -1 | 1) {
    let res = state.doc.resolve(pos)
    if (!res.parent.node.inlineContent) return Text.createInner(pos, pos, bias)
    let start = pos,
        end = pos,
        text = ""
    scanBack: for (let i = res.index - (res.inText ? 0 : 1), cur = res.nodeBefore; cur; ) {
        if (!cur.is(Leaf.Text)) break
        for (let j = cur.length; j > 0; ) {
            let next = findClusterBreak(cur.param, j, false)
            let ch = cur.param.slice(next, j)
            if (!/\p{L}|\p{N}/u.test(ch)) break scanBack
            text = ch + text
            start -= j - next
            j = next
        }
        if (!i) break
        cur = res.parent.node.content[--i]
    }
    scanForward: for (let i = res.index + 1, cur = res.nodeAfter; cur; ) {
        if (!cur.is(Leaf.Text)) break
        for (let j = 0; j < cur.length; ) {
            let next = findClusterBreak(cur.param, j, true)
            let ch = cur.param.slice(j, next)
            if (!/\p{L}|\p{N}/u.test(ch)) break scanForward
            text += ch
            end += next - j
            j = next
        }
        if (i == res.parent.node.content.length) break
        cur = res.parent.node.content[i++]
    }
    if (!(Intl as any).Segmenter) return Text.createInner(start, end)
    let best: any = null,
        local = pos - start
    for (let segment of new (Intl as any).Segmenter(undefined, {granularity: "word"}).segment(text)) {
        if (
            segment.isWordLike &&
            segment.index <= local &&
            segment.index + segment.segment.length >= local &&
            (!best || bias > 0)
        )
            best = segment
    }
    return best
        ? Text.createInner(start + best.index, start + best.index + best.segment.length)
        : Text.createInner(pos, pos, bias)
}
