import type {Node} from "./types"
import type {Leaf} from "./leaf"

/**
 * Accumulates plain text while walking a document range or slice.
 * Inserts `blockSep` between block-level runs (default newline behavior).
 */
export class TextOutput {
    text = ""
    started = false

    constructor(
        readonly blockSep: string,
        readonly leafText?: (node: Leaf) => string,
    ) {}

    /**
     * Append text for one node. Returns true when the node produced text
     * (and thus children need not be walked for textblocks that already emitted).
     */
    serialize(node: Node): boolean {
        let nodeText = node.isPlot
            ? null
            : node.isText
              ? (node.param as string)
              : node.type.spec.toText
                ? node.type.spec.toText(node)
                : this.leafText
                  ? this.leafText(node)
                  : ""
        if (node.isLeaf ? node.type.isBlock && nodeText : node.isTextblock) this.openBlock()
        if (nodeText != null) {
            this.text += nodeText
            this.started = true
        }
        return nodeText != null
    }

    openBlock() {
        if (this.started) this.text += this.blockSep
        else this.started = true
    }
}
