/**
 * Shared image helpers used by image extensions and the image dialog.
 *
 * Kept in a leaf module so `image.ts` and `image-dialog.ts` do not import each
 * other (avoids circular dependencies). Public re-exports go through
 * `image.ts` / package index.
 */
import {type Node} from "@arrisa/doc"
import {EditorSelection, EditorState} from "@arrisa/state"
import {CaptionedFigure, Figure, Image} from "@arrisa/types"
import type {Arrisa} from "@arrisa/editor"

/**
 * Facet for custom image upload handlers (file picker and drop).
 *
 * Handler receives the file, the editor, and a progress callback (0–100).
 * Resolves to a final image URL string. Provide at most one handler in practice
 * (first facet value is used).
 */
export let imageUploader =
    EditorState.Facet.define<(file: File, editor: Arrisa, progress: (percent: number) => void) => Promise<string>>()

let imageTypes: Node.Type[] = [Image, Figure, CaptionedFigure]

/**
 * Active image/figure tag at the current selection, if any.
 *
 * Matches a node selection of Image/Figure/CaptionedFigure, or a cursor inside
 * a captioned figure’s content.
 */
export function activeImage(sel: EditorSelection.Resolved) {
    if (sel.selection instanceof EditorSelection.Node && imageTypes.includes(sel.selection.node.type))
        return sel.selection.node.tag
    if (sel.head.parent.start == sel.anchor.parent.start && sel.head.parent.node.type == CaptionedFigure)
        return sel.head.parent.node.tag
    return null
}
