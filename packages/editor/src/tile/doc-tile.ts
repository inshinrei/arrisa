/**
 * Root content tile: owns the content DOM, tracks decorations, and maps
 * between document positions and the live tile/DOM tree.
 */
import {ChangeSet, type Mark} from "@arrisa/doc"
import {EditorState} from "@arrisa/state"
import {
    type DecoSet,
    getDecoSet,
    findChangedRanges,
    DecoIterator,
} from "../decoration"
import type {DOMNode} from "../dom/dom"
import {textRange} from "../dom/dom"
import {findClusterBreak} from "@arrisa/state"
import type {CompositionInfo} from "../input/composition"
import {eqArray} from "../util"
import {TileFlag} from "./flag"
import {TilePos} from "./pos"
import {CompositeTile, Tile} from "./tile"
import {TextTile} from "./leaves"
import {ContentUpdate, separateComposition} from "./content-update"

const LOG_update = false

export class DocTile extends CompositeTile {
    declare dom: Element

    constructor(
        readonly state: EditorState,
        dom: Element,
        readonly cursorWrapper: Mark.Set | null,
        readonly decoSet: DecoSet,
    ) {
        super(dom, TileFlag.PlotContent)
    }

    get isDoc() {
        return true
    }

    get node() {
        return this.state.doc
    }

    static create(state: EditorState, dom: Element) {
        return new DocTile(state, dom, null, {points: new Map(), ranges: new Map()}).updateRanges(
            state,
            getDecoSet(state),
            [0, state.doc.length],
            false,
        )
    }

    update(state: EditorState, changes: ChangeSet.Sections, connected = false, composition?: CompositionInfo | null) {
        let decoSet = getDecoSet(state)
        let changed = findChangedRanges(this.state, this.decoSet, state, decoSet, changes)
        return this.updateRanges(state, decoSet, changed, connected, composition)
    }

    updateRanges(
        state: EditorState,
        decoSet: DecoSet,
        sections: ChangeSet.Sections,
        connected: boolean,
        composition?: CompositionInfo | null,
    ) {
        let wrapper = composition?.wrapCursor || null
        if ((!sections.length || (sections.length == 2 && sections[1] == -1)) && eqArray(wrapper, this.cursorWrapper))
            return this
        LOG_update && console.log(`updateRanges(${state.doc},`, sections, ",", composition, ")")
        if (composition) {
            let separated = separateComposition(sections, composition)
            LOG_update && !separated && console.log("separateComposition failed")
            if (!separated) composition = null
            else sections = separated
        }
        let builder = new ContentUpdate(state, this, new DecoIterator(state, decoSet), wrapper)
        for (let i = 0, posB = 0, startCovered = false; i < sections.length;) {
            let len = sections[i++],
                ins = sections[i++]
            LOG_update &&
                console.log(
                    "section",
                    len,
                    ins,
                    "new=" + builder.new,
                    "old=" + builder.old.tile,
                    "@",
                    builder.old.index,
                )
            if (composition && posB == composition.fromB && ins >= 0) {
                LOG_update && console.log("(composition)")
                if (!startCovered) builder.update(0, false)
                builder.composition(composition!, len)
                if (ins && (startCovered = i == sections.length || sections[i + 1] == -1)) builder.update(0, false)
            } else if (ins == -1) {
                builder.keep(len, !startCovered, i == sections.length)
                startCovered = false
            } else if (ins == -2) {
                builder.update(len, !startCovered)
                startCovered = true
            } else {
                builder.replace(len, ins, !startCovered)
                startCovered = true
            }
            posB += ins >= 0 ? ins : len
        }
        let result = builder.finish()
        result.sync()
        if (connected) {
            for (let ch of this.children) ch.disconnect(builder.reused)
            for (let tile of builder.toConnect) tile.widget.type.connect!(tile.widget.value, tile.dom)
        }
        LOG_update && console.log("/updateRanges " + result + " : " + result.dom.innerHTML)
        return result
    }

    nearest(dom: DOMNode, requireNode = false) {
        for (let cur: DOMNode | null = dom; cur; cur = cur.parentNode) {
            let elt = cur.arrisaTile
            if (elt && (!requireNode || elt.node) && this.owns(elt)) return elt
        }
        return null
    }

    owns(elt: Tile) {
        for (;;) {
            if (elt == this) return true
            let {parent} = elt
            if (!parent) return false
            elt = parent
        }
    }

    nodeTile(pos: number) {
        let off = 0,
            parent: Tile = this
        search: for (;;) {
            for (let ch of parent.children) {
                let end = off + ch.length
                if (pos < end) {
                    if ((off == pos && ch.node) || ch instanceof TextTile) return ch
                    parent = ch
                    off += ch.boundary
                    continue search
                }
                off = end
            }
            return null
        }
    }

    resolve(pos: number, side: -1 | 1 = -1) {
        let parent: Tile = this,
            i = 0
        search: for (let scan: Tile = this, off = 0; ;) {
            for (let j = 0; j < scan.children.length && off <= pos; j++) {
                let ch = scan.children[j],
                    end = off + ch.length
                if (scan == parent) {
                    if (off == pos) i = j
                    else if (pos == end) i = j + 1
                }
                if (ch.isPlotContent && !ch.boundary ? pos >= off && pos <= end : pos > off && pos < end) {
                    if (ch instanceof TextTile) return new TilePos(ch, pos - off, pos)
                    scan = ch
                    off += ch.boundary
                    if (ch.isPlotContent || ch.isWrapper) parent = ch
                    else if (ch.isAtom) pos = end
                    continue search
                }
                off = end
            }
            break
        }

        adjust: for (;;) {
            if (i) {
                let before = parent.children[i - 1],
                    parentBefore = parent,
                    beforeI = i - 1
                while (before.isWrapper) {
                    parentBefore = before
                    before = before.children[(beforeI = before.children.length - 1)]
                }
                if (
                    (before.isNodeInner && before.flags & TileFlag.AfterContent) ||
                    before.flags & TileFlag.PointAfter
                ) {
                    parent = parentBefore
                    i = beforeI
                    continue
                }
            }
            if (i < parent.children.length) {
                let after = parent.children[i],
                    parentAfter = parent,
                    afterI = i
                while (after.isWrapper) {
                    parentAfter = after
                    after = after.children[(afterI = 0)]
                }
                if (
                    (after.isNodeInner && !(after.flags & TileFlag.AfterContent)) ||
                    after.flags & TileFlag.PointBefore
                ) {
                    parent = parentAfter
                    i = afterI + 1
                    continue
                }
            }
            break
        }

        if (side < 0) {
            while (!i && parent.isWrapper) {
                i = parent.parent!.children.indexOf(parent)
                parent = parent.parent!
            }
            while (i) {
                let before = parent.children[i - 1]
                if (before.isPoint && !(before.flags & TileFlag.PointSide) && !before.isNodeInner) {
                    i--
                } else if (before.isWrapper) {
                    parent = before
                    i = parent.children.length
                } else {
                    if (before instanceof TextTile) {
                        parent = before
                        i = parent.length
                    }
                    break
                }
            }
        } else {
            while (parent.isWrapper && i == parent.children.length) {
                i = parent.parent!.children.indexOf(parent) + 1
                parent = parent.parent!
            }
            while (i < parent.children.length) {
                let after = parent.children[i]
                if (after.isPoint && !(after.flags & TileFlag.PointSide) && !after.isNodeInner) {
                    i++
                } else if (after.isWrapper) {
                    parent = after
                    i = 0
                } else {
                    if (after instanceof TextTile) {
                        parent = after
                        i = 0
                    }
                    break
                }
            }
        }

        return new TilePos(parent, i, pos)
    }

    posFromDOM(dom: DOMNode, offset: number, bias: -1 | 1 = -1) {
        let elt = this.nearest(dom)
        if (!elt) return this.dom.compareDocumentPosition(dom) & 4 /* following */ ? this.length : 0
        if (elt.isText) return elt.posAtStart + Math.min(offset, elt.length)
        if (elt.isAtom) return elt.posAtStart + (bias > 0 ? elt.length : 0)

        let domBefore, eltBefore: Tile | undefined
        if (dom == elt.dom) {
            domBefore = dom.childNodes[offset - 1]
        } else {
            while (dom.parentNode != elt.dom) dom = dom.parentNode!
            domBefore = dom.previousSibling
        }
        while (domBefore && !((eltBefore = domBefore.arrisaTile) && eltBefore.parent == elt))
            domBefore = domBefore.previousSibling
        return domBefore ? elt.posBeforeChild(eltBefore!) + eltBefore!.length : elt.posAtStart
    }

    posBeforeDOM(dom: DOMNode) {
        let tile = this.nearest(dom)
        if (!tile) return null
        let pos = tile.posAtStart
        if (tile.dom != dom)
            for (let ch of tile.children) {
                if (ch.dom.compareDocumentPosition(dom) & 2 /* preceding */) break
                pos += ch.length
            }
        return pos
    }

    coordsForElement(pos: number): DOMRect | null {
        let tile = this.nodeTile(pos)
        if (!tile) return null
        if (tile instanceof TextTile) return textTileRect(tile, pos - tile.posBefore)
        return (tile.dom as Element).getBoundingClientRect()
    }
}


function textTileRect(tile: TextTile, offset: number) {
    return textRange(tile.dom, offset, findClusterBreak(tile.text, offset)).getBoundingClientRect()
}
