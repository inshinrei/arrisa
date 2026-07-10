/**
 * Document root types for block and inline-only documents.
 */
import {Plot, Node} from "@arrisa/doc"

const G = Node.Group

/** Top-level document root holding block {@link Node.Group.Content}. */
export const Doc = Plot.defineDoc({
    blockContent: G.Content,
})

/** Inline-only document root (e.g. single-line fields). */
export const InlineDoc = Plot.defineDoc({
    inlineContent: true,
})
