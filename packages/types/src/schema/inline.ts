/**
 * Inline leaf nodes (non-text).
 */
import {Leaf, Node} from "@arrisa/doc"

/**
 * Hard line break (`br`). Inline leaf with role {@link Node.Role.LineBreak}.
 * Text form is a newline.
 */
export const LineBreak = Leaf.define("LineBreak", {
    inline: true,
    role: Node.Role.LineBreak,
    toText: () => "\n",
    shape: {element: "br"},
})
