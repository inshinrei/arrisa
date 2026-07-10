/**
 * Position types for coordinate hit-testing and tile resolution.
 */
import {type ChangeSet} from "@arrisa/doc"
import {EditorState, TextblockMap, BidiSpan} from "@arrisa/state"
import type {Tile} from "./tile"

/** Result of mapping a viewport point to a document position. */
export class CoordPos {
    constructor(
        readonly pos: number,
        /** Position of the leaf/node hit when the click is inside it, else null. */
        readonly target: number | null,
        readonly side: -1 | 1,
        readonly vertOutside: boolean,
    ) {}

    static create(pos: number, side: -1 | 1, target: number | null = null, vertOutside = false) {
        return new CoordPos(pos, target, side, vertOutside)
    }

    map(mapping: ChangeSet) {
        let target = this.target == null ? null : mapping.mapPos(this.target, 1, "after")
        return new CoordPos(mapping.mapPos(this.pos), target, this.side, this.vertOutside)
    }
}

/** Resolved location of a document position inside the tile tree. */
export class TilePos {
    constructor(
        readonly tile: Tile,
        readonly offset: number,
        readonly pos: number,
    ) {}

    get dom() {
        return this.tile.dom
    }
}

/** Whether the bidi order at `pos` (with association) is LTR. */
export function ltrAt(state: EditorState, pos: number, assoc: -1 | 1, textblock?: TextblockMap | null) {
    if (textblock === undefined) {
        let {textblockParent: block} = state.doc.resolve(pos)
        textblock = block ? TextblockMap.get(block.start, block.node, state.textblockLTR(block.node)) : null
    }
    if (!textblock) return state.textLTR
    let found = BidiSpan.find(textblock.order, pos - textblock.start, assoc)
    return textblock.order[found].ltr
}
