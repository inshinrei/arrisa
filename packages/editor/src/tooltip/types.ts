/**
 * Shared tooltip type surface used by the manager and hover host.
 *
 * Kept separate from `hover.ts` so `manager.ts` can import types without a
 * cycle (manager ↔ hover via plugin registration).
 */
import type {Arrisa} from "../editor"

/** A tooltip instance produced by facets or hover sources. */
export interface Tooltip {
    /** Document position the tooltip is anchored to. */
    pos: number
    /** Optional end of the anchor range (for multi-position tooltips). */
    end?: number
    /** Prefer placing the tooltip above the anchor. */
    above?: boolean
    /** Do not flip above/below even when space is tight. */
    strictSide?: boolean
    /** Show a caret arrow pointing at the anchor. */
    arrow?: boolean
    /** Hide when the anchor leaves the visible/space clip (default true). */
    clip?: boolean
    create(editor: Arrisa): Tooltip.View
}

export namespace Tooltip {
    /** Live DOM view for a tooltip instance. */
    export interface View {
        dom: HTMLElement
        offset?: {x: number; y: number}
        getCoords?: (pos: number) => DOMRect
        /** Allow overlapping other tooltips without vertical stacking. */
        overlap?: boolean
        /** Shrink height when vertical space is insufficient (default true). */
        resize?: boolean
        update?(update: Arrisa.Update): void
        connect?(editor: Arrisa): void
        disconnect?(editor: Arrisa): void
        remove?(editor: Arrisa): void
        positioned?(space: DOMRect): void
    }
}

/** Sync or async provider used by {@link Tooltip.hover}. */
export type HoverTooltipSource = (
    editor: Arrisa,
    pos: number,
    side: -1 | 1,
) => Tooltip | readonly Tooltip[] | null | Promise<Tooltip | readonly Tooltip[] | null>
