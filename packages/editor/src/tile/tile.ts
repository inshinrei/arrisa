/**
 * Tile tree: a position ↔ DOM bridge for the editor content.
 *
 * Each tile owns a DOM node, a document length, and optional children.
 * Composite tiles sync child DOM order and resolve pointer coordinates
 * via row/column scans ({@link rowScan}, {@link CompositeTile.posAtCoordsCol}).
 */
import {type Node, type Plot} from "@arrisa/doc"
import type {Arrisa} from "../editor"
import {EditorState, TextblockMap} from "@arrisa/state"
import type {DOMNode} from "../dom/dom"
import {rmDOM, textRange} from "../dom/dom"
import {TileFlag, Reused} from "./flag"
import {CoordPos} from "./pos"

/** Layout direction used when mapping viewport coords to document positions. */
export const enum Orientation {
    Row,
    Col,
}

/** One node in the content tile tree, bound to a DOM node. */
export abstract class Tile {
    parent: CompositeTile | null = null
    abstract children: Tile[]
    length = 0
    flags: TileFlag

    constructor(
        public dom: Element | Text,
        flags: number,
    ) {
        this.flags = flags & ~TileFlag.Synced
        dom.arrisaTile = this
    }

    get isAtom() {
        return false
    }
    get isNodeOuter() {
        return false
    }
    get isNodeInner() {
        return (this.flags & TileFlag.NodeInner) > 0
    }
    get isNode() {
        return this.isNodeOuter || (this.flags & TileFlag.NodeInner) > 0
    }
    get isPlotContent() {
        return (this.flags & TileFlag.PlotContent) > 0
    }
    get isText() {
        return false
    }
    get isDoc() {
        return false
    }
    get isWrapper() {
        return (this.flags & TileFlag.Wrapper) > 0
    }
    get isSpanning() {
        return false
    }
    get isComposition() {
        return (this.flags & TileFlag.Composition) > 0
    }
    get isPoint() {
        return (this.flags & TileFlag.Point) > 0
    }
    get node(): Node | null {
        return null
    }

    get posBefore() {
        return this.parent!.posBeforeChild(this)
    }

    get posAtStart() {
        return this.parent ? this.parent.posBeforeChild(this) + this.boundary : 0
    }

    get posAfter() {
        return this.posBefore + this.length
    }

    get posAtEnd() {
        return this.posAtStart + this.length - 2 * this.boundary
    }

    get boundary(): 0 | 1 {
        return 0
    }

    get firstChild(): Tile | null {
        return this.children.length ? this.children[0] : null
    }

    get lastChild(): Tile | null {
        let last = this.children.length - 1
        return last < 0 ? null : this.children[last]
    }

    get ignoreMutations() {
        return false
    }

    static get(node: DOMNode) {
        return node.arrisaTile
    }

    posBeforeChild(child: Tile, ownStart = this.posAtStart): number {
        for (let i = 0, pos = ownStart; i < this.children.length; i++) {
            let cur = this.children[i]
            if (cur == child) return pos
            pos += cur.length
        }
        throw new RangeError("Child not found in tile")
    }

    handleEvent(event: Event, editor: Arrisa) {
        return false
    }

    toString() {
        return this.dom.nodeName + (this.children.length ? `(${this.children})` : "")
    }

    sync() {}

    connect() {
        for (let ch of this.children) ch.connect()
    }

    disconnect(reused?: Map<Tile, Reused>) {
        if (!reused || reused.get(this) != Reused.Full) for (let ch of this.children) ch.disconnect(reused)
    }

    nearestNode() {
        let tile: Tile = this
        while (!tile.node) tile = tile.parent!
        return tile
    }

    posAtCoords(state: EditorState, x: number, y: number): CoordPos {
        let nodeTile = this.nearestNode()
        return nodeTile.posAtCoordsInner(nodeTile.posAtStart, state, x, y, null, Orientation.Col)
    }

    abstract posAtCoordsInner(
        start: number,
        state: EditorState,
        x: number,
        y: number,
        textblock: TextblockMap | null,
        orientation: Orientation,
    ): CoordPos
}

/** Tile with ordered children; owns DOM reconciliation in {@link syncChildren}. */
export class CompositeTile extends Tile {
    children: Tile[] = []
    declare dom: Element

    addChild(child: Tile) {
        if (this.flags & TileFlag.Synced) throw new Error("Cannot add to a synced tile")
        if (this.flags & TileFlag.ContentNotLast && !(child.flags & TileFlag.AfterContent)) {
            let i = this.children.length
            while (i > 0 && this.children[i - 1].flags & TileFlag.AfterContent) i--
            this.children.splice(i, 0, child)
        } else {
            this.children.push(child)
        }
        child.parent = this
    }

    sync() {
        if (this.flags & TileFlag.Synced) return
        this.flags |= TileFlag.Synced
        let len = this.boundary * 2
        for (let ch of this.children) {
            ch.sync()
            len += ch.length
        }
        if (!(this.flags & TileFlag.Atom)) this.length = len
        this.syncChildren()
    }

    syncChildren() {
        let prev: DOMNode | null = null,
            next: ChildNode | null = this.dom.firstChild
        for (let child of this.children) {
            if (child.dom.parentNode == this.dom) {
                while (next && next != child.dom) next = rmDOM(next)
            } else {
                this.dom.insertBefore(child.dom, next)
            }
            prev = child.dom
            next = prev.nextSibling
        }
        while (next) next = rmDOM(next)
    }

    posAtCoordsInner(
        start: number,
        state: EditorState,
        x: number,
        y: number,
        textblock: TextblockMap | null,
        orientation: Orientation,
    ): CoordPos {
        let {node} = this,
            outerOrientation = orientation
        if (node && node.isPlot) {
            orientation = node.type.orientation == "row" ? Orientation.Row : Orientation.Col
            if (node.isTextblock) {
                textblock = TextblockMap.get(
                    start,
                    start ? (state.doc.nodeAt(start - 1) as Plot) : state.doc,
                    state.textblockLTR(node),
                )
            } else if (node.type.isBlock) {
                textblock = null
            }
        } else if (node && node.isText) {
            orientation = Orientation.Row
        }
        let result =
            this.isAtom || !this.children.length
                ? null
                : orientation == Orientation.Col
                  ? this.posAtCoordsCol(start, state, x, y, textblock)
                  : this.posAtCoordsRow(start, state, x, y, textblock)
        if (result) return result
        let rect = this.dom.getBoundingClientRect()
        let after =
            outerOrientation == Orientation.Row ? x > (rect.left + rect.right) / 2 : y > (rect.top + rect.bottom) / 2
        let target =
            this.node && this.node.isLeaf && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
                ? start
                : null
        return CoordPos.create(start + (after ? this.length - 2 * this.boundary : 0), after ? -1 : 1, target)
    }

    posAtCoordsRow(
        start: number,
        state: EditorState,
        x: number,
        y: number,
        textblock: TextblockMap | null,
    ): CoordPos | null {
        let result = rowScan<Tile>(x, y, (add) => {
            for (let child of this.children) {
                if (child.isPoint) continue
                let rects,
                    {dom} = child
                if (dom.nodeType == 1) rects = (dom as Element).getClientRects()
                else if (dom.nodeType == 3) rects = textRange(dom as Text, 0, dom.nodeValue!.length).getClientRects()
                else continue
                for (let i = 0; i < rects.length; i++) if (add(rects[i], child)) return
            }
        })
        if (!result) return null
        let {closest, rect} = result
        let pos = this.posBeforeChild(closest, start)
        return closest.posAtCoordsInner(
            pos + closest.boundary,
            state,
            x,
            Math.max(rect!.top, Math.min(rect!.bottom, y)),
            textblock,
            Orientation.Row,
        )
    }

    posAtCoordsCol(start: number, state: EditorState, x: number, y: number, textblock: TextblockMap | null): CoordPos {
        let lastBot = -1
        for (let child of this.children) {
            if (child.isPoint || child.dom.nodeType != 1) continue
            let rect = (child.dom as Element).getBoundingClientRect()
            if (rect.top > y)
                return CoordPos.create(this.posBeforeChild(child, start), y > (lastBot + rect.top) / 2 ? 1 : -1)
            if (rect.bottom >= y)
                return child.posAtCoordsInner(
                    this.posBeforeChild(child, start) + child.boundary,
                    state,
                    x,
                    y,
                    textblock,
                    Orientation.Col,
                )
            lastBot = rect.bottom
        }
        return CoordPos.create(start + this.length - 2 * this.boundary, -1)
    }
}

/**
 * Find the closest horizontal-band target near `(x, y)`.
 * The scan callback feeds rects; when the point lies beside a band that
 * also has content above/below, the search restarts at the nearer edge.
 */
export function rowScan<T>(
    x: number,
    y: number,
    scan: (rect: (rect: DOMRect, value: T) => boolean) => void,
): {closest: T; rect: DOMRect} | null {
    let closest: T | null = null,
        closestDx = 1e8,
        closestRect: DOMRect | null = null as any
    let above: DOMRect | null = null as any,
        below: DOMRect | null = null as any
    scan((rect: DOMRect, value: T) => {
        if (rect.bottom < y) {
            if (!above || above.bottom < rect.bottom) above = rect
        } else if (rect.top > y) {
            if (!below || below.top > rect.top) below = rect
        } else {
            let dx = rect.left > x ? rect.left - x : rect.right < x ? x - rect.right : 0
            if (dx < closestDx) {
                closest = value
                closestDx = dx
                closestRect = rect
                return !dx
            }
        }
        return false
    })

    if (closestRect) {
        if (closestDx) {
            if (above && above.bottom > closestRect.top) return rowScan(x, above.bottom - 1, scan)
            if (below && below.top < closestRect.bottom) return rowScan(x, below.top + 1, scan)
        }
        return {closest: closest!, rect: closestRect}
    }
    let side: DOMRect | null = above && (!below || y - above.bottom < below.top - y) ? above : below
    if (!side) return null
    return rowScan(x, (side.top + side.bottom) / 2, scan)
}
