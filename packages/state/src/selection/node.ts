/**
 * Node selection: covers a single selectable leaf (e.g. image, horizontal rule).
 *
 * Equality is positional (`anchor` only) — the node identity is not compared.
 * Mapping uses track mode `"after"` so deleting the leaf falls back to a nearby
 * text cursor via {@link EditorSelection.near} (wired from `./selection`).
 */
import {type ChangeSet, type Leaf, type Plot, ValidationError} from "@arrisa/doc"
import {EditorSelection} from "./base"
import {SelectionType} from "./type"
import {Text} from "./text"

let nearFallback: (cx: EditorSelection.Context, pos: number, bias: -1 | 1) => Text = (cx, pos, bias) =>
    Text.createInner(pos, pos, bias)

/** Called from `./selection` once `near` is defined. */
export function setNodeNearFallback(fn: typeof nearFallback) {
    nearFallback = fn
}

export class Node extends EditorSelection {
    private constructor(
        from: number,
        to: number,
        readonly node: Leaf,
        goalColumn?: number,
    ) {
        super(from, to, goalColumn)
    }

    static create(pos: number, node: Leaf, goalColumn?: number) {
        return new Node(pos, pos + node.length, node, goalColumn)
    }

    map(change: ChangeSet, cx: EditorSelection.Context, assoc: -1 | 1 = -1) {
        let newPos = change.mapPos(this.anchor, 1, "after")
        if (newPos == null) return nearFallback(cx, change.mapPos(this.anchor, assoc), assoc)
        return Node.create(newPos, cx.doc.nodeAt(newPos) as Leaf)
    }

    /** Positional equality only (does not compare `node`). */
    eq(other: EditorSelection) {
        return other instanceof Node && other.anchor == this.anchor
    }
}

export namespace Node {
    export type JSON = {
        pos: number
    }

    export const type = new SelectionType(
        "node",
        Node,
        (sel): JSON => ({pos: sel.anchor}),
        (doc: Plot.Doc, json: JSON) => {
            let node = json && typeof json.pos == "number" && doc.nodeAt(json.pos)
            if (!node || node.isText || node.isPlot || !node.type.isSelectable)
                throw new ValidationError("Invalid EditorSelection.Node JSON representation")
            return Node.create(json.pos, node)
        },
    )
}
