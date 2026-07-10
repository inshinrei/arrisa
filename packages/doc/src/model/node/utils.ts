import {SchemaError} from "../../util/error"
import {Mark} from "../mark"
import {NodeFlag} from "./flags"
import {Node} from "./types"
import {Leaf} from "./leaf"
import type {Plot} from "./plot"
import type {Token} from "../slice"

/** Derive {@link NodeFlag} bits from a leaf/plot spec. */
export function flagsFor(spec: Plot.Spec<any> | Leaf.Spec<any>) {
    let flags = spec.inline ? NodeFlag.Inline : NodeFlag.None
    if ("inlineContent" in spec && spec.inlineContent && "blockContent" in spec && spec.blockContent)
        throw new SchemaError("A tag cannot have both block and inline content")
    if ("inlineContent" in spec && spec.inlineContent) flags |= NodeFlag.InlineContent
    if (("inlineContent" in spec && spec.inlineContent) || ("canBeEmpty" in spec && spec.canBeEmpty))
        flags |= NodeFlag.CanBeEmpty
    if ((spec as Leaf.Spec<any>).selectable) flags |= NodeFlag.Selectable
    return flags
}

/** Compact debug string for a mark set, e.g. `[bold,link="…"]`. */
export function markString(marks: Mark.Set) {
    let values: string[] = []
    for (let mark of marks) {
        if (mark.type.default == mark) values.push(mark.type.name)
        else values.push(`${mark.type.name}=${JSON.stringify(mark.value)}`)
    }
    return values.length ? `[${values.join()}]` : ""
}

/**
 * Emit open/node/close tokens for a content range into `out`.
 * Offsets are relative to the start of `content` (plot content, not including open token).
 */
export function sliceContent(out: Token[], content: readonly Node[], from: number, to: number) {
    if (from >= to) return
    let off = 0
    for (let child of content) {
        if (off >= to) break
        let start = off
        off += child.length
        if (off <= from) continue
        if (child.isPlot) {
            child.slicePlot(out, from - start, to - start)
        } else if (child.isText) {
            out.push(child.sliceText(from - start, to - start))
        } else {
            out.push(child)
        }
    }
}

/** Merge adjacent text leaves that share the same mark set. */
export function joinText(nodes: readonly Node[]) {
    if (!nodes.length || nodes[0].type.isBlock) return nodes
    let joined: Node[] | undefined
    for (let i = 0, last: Leaf<string> | null = null; i < nodes.length; i++) {
        let node = nodes[i]
        if (node.is(Leaf.Text)) {
            if (last && Mark.sameSet(last.marks, node.marks)) {
                if (!joined) joined = nodes.slice(0, i)
                last = joined[joined.length - 1] = Leaf.text(last.param + node.param, node.marks)
                continue
            } else {
                last = node
            }
        } else {
            last = null
        }
        if (joined) joined.push(node)
    }
    return joined || nodes
}
