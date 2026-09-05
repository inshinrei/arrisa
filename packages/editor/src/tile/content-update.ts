/**
 * Incremental content rebuild: walks old tiles and decorations to produce
 * a new {@link DocTile}, reusing DOM where possible ({@link Reused}).
 *
 * {@link TilePointer} advances through the old tree by document distance;
 * {@link ContentUpdate} builds the new tree section-by-section (keep /
 * replace / update / composition).
 */
import {Attributes, ChangeSet, Elt, Leaf, Mark, type Node} from "@arrisa/doc"
import {EditorState} from "@arrisa/state"
import type {CompositionInfo} from "../input/composition"
import {
    Widget,
    type DecoElt,
    Decoration,
    DecoIterator,
    renderWrapper,
    renderMarkWrapper,
    type WrapperSource,
} from "../decoration"
import {TileFlag, Reused} from "./flag"
import {Tile, CompositeTile} from "./tile"
import {EltTile, WidgetTile, TextTile} from "./leaves"
import {DocTile} from "./doc-tile"
import {updateAttributes, takeAttributes} from "./attributes"


const brHack = Widget.create({
    render() {
        return document.createElement("br")
    },
})

const imgHack = Widget.create({
    render() {
        return document.createElement("img")
    },
})

export interface TileWalker {
    enter(tile: EltTile): void
    skip(tile: Tile, from: number, to: number): void
    leave(tile: EltTile): void
}

export class TilePointer {
    constructor(
        readonly tile: Tile,
        readonly index: number,
        readonly parent: TilePointer | null,
    ) {}

    walk(dist: number, side: -1 | 1, walker?: TileWalker) {
        let {tile, index, parent} = this,
            nodeBoundary = 0
        for (;;) {
            if (!dist && side < 0 && !nodeBoundary) break
            if (tile.isText) {
                if (!dist) break
                nodeBoundary = 0
                let left = tile.length - index
                if (dist >= left) {
                    dist -= left
                    if (left && walker) walker.skip(tile, index, tile.length)
                    ;({tile, index, parent} = parent!)
                    index++
                } else {
                    if (walker) walker.skip(tile, index, index + dist)
                    index += dist
                    dist = 0
                }
            } else if (index == tile.children.length) {
                if (!dist && (tile.isDoc || (nodeBoundary != 2 && tile.isNode))) break
                if (walker) walker.leave(tile as EltTile)
                nodeBoundary = tile.isNodeInner ? 2 : 0
                dist -= tile.boundary
                ;({tile, index, parent} = parent!)
                index++
            } else {
                let next = tile.children[index]
                if (nodeBoundary == 1 && !next.isNodeInner) {
                    nodeBoundary = 0
                    if (side < 0 && !dist) break
                }
                if (!dist && next.isNodeInner && !nodeBoundary) break
                if (next.length <= dist) {
                    if (walker) walker.skip(next, 0, next.length)
                    dist -= next.length
                    index++
                    if (!next.isNodeInner) nodeBoundary = 0
                } else {
                    if (next.isNodeOuter && (!dist || (next.isAtom && !next.isText))) break
                    if (walker && !next.isText) walker.enter(next as EltTile)
                    dist -= next.boundary
                    parent = tile == this.tile && index == this.index ? this : new TilePointer(tile, index, parent)
                    tile = next
                    index = 0
                    nodeBoundary = next.isNode ? 1 : 0
                }
            }
        }
        return tile == this.tile && index == this.index ? this : new TilePointer(tile, index, parent)
    }

    tileAfter() {
        let {tile, index} = this
        if (tile.isText) return tile
        return index < tile.children.length ? tile.children[index] : null
    }

    matchingWrapper(elt: DecoElt, spanning: boolean, reused: Map<Tile, Reused>) {
        let best: EltTile | undefined,
            bestScore = 0
        let start = this.tile.isText ? this.parent! : this
        for (let {tile, parent} = start; !(tile.isNode || tile.isDoc); {tile, parent} = parent!) {
            let wrap = tile as EltTile
            if (reused.has(wrap) || wrap.elt.tagName != elt.tagName || wrap.isSpanning != spanning) continue
            let score = Attributes.compare(wrap.elt.attrs, elt.attrs)
            if (!best || bestScore < score) {
                best = wrap
                bestScore = score
            }
        }
        if (!best) return null
        if (bestScore < 0) updateAttributes(best.dom, best.elt.attrs, elt.attrs)
        reused.set(best, Reused.DOM)
        return best.dom
    }

    matchingWidget(widget: Widget<any>, sideFlag: number, reused: Map<Tile, Reused>) {
        let {index, tile, parent} = this
        for (;;) {
            if (!index) {
                if (!parent || (tile instanceof EltTile ? tile.node : !(tile instanceof TextTile))) break
                ;({index, tile, parent} = parent)
            } else {
                if (tile instanceof TextTile) break
                let before = tile.children[--index]
                if (!before.isPoint) break
                if (
                    !reused.has(before) &&
                    before instanceof WidgetTile &&
                    before.widget.eq(widget) &&
                    (before.flags & TileFlag.PointSide) == sideFlag &&
                    !(before.flags & TileFlag.Dirty)
                ) {
                    reused.set(before, Reused.Full)
                    return before
                }
            }
        }
        return null
    }
}



export class ContentUpdate {
    old: TilePointer
    new: CompositeTile

    posB = 0
    reused = new Map<Tile, Reused>()
    keepWalker: TileWalker
    toConnect: WidgetTile[] = []

    constructor(
        readonly state: EditorState,
        old: DocTile,
        readonly deco: DecoIterator,
        cursorWrapper: Mark.Set | null,
    ) {
        this.old = new TilePointer(old, 0, null)
        this.new = new DocTile(state, old.dom as Element, cursorWrapper, deco.decoSet)
        this.keepWalker = {
            enter: (tile) => {
                let span = tile.isSpanning && this.enterSpanning(tile.elt)
                if (span) {
                    this.new = span
                } else {
                    this.reused.set(tile, Reused.DOM)
                    let inner = EltTile.of(tile.elt, tile.node, tile.flags, tile.boundary * 2, tile.dom)
                    this.new.addChild(inner)
                    this.new = inner
                }
            },
            leave: (tile) => {
                if (tile.isWrapper) {
                    for (let scan = this.new, i = 0; ;) {
                        if (!scan.isWrapper) break
                        if ((scan as EltTile).elt.eq(tile.elt) && scan.isSpanning == tile.isSpanning) {
                            for (let j = 0; j <= i; j++) this.up()
                            break
                        }
                        if (!scan.parent) break
                        scan = scan.parent
                    }
                } else if (tile.isNodeOuter) {
                    this.leaveNode()
                    this.leaveWrappers()
                }
            },
            skip: (tile, from, to) => {
                if (!(tile instanceof TextTile)) {
                    this.reused.set(tile, Reused.Full)
                    this.new.addChild(tile)
                } else if (this.new.lastChild instanceof TextTile && !this.new.lastChild.isComposition) {
                    this.addText(tile.text.slice(from, to))
                } else if (
                    !from &&
                    to == tile.text.length &&
                    !(tile.flags & TileFlag.Dirty) &&
                    !this.reused.has(tile)
                ) {
                    this.reused.set(tile, Reused.Full)
                    this.new.addChild(tile)
                } else if (!this.reused.has(tile)) {
                    this.reused.set(tile, Reused.DOM)
                    this.new.addChild(new TextTile(tile.text.slice(from, to), tile.dom))
                } else {
                    this.new.addChild(TextTile.of(tile.text.slice(from, to)))
                }
            },
        }
    }

    keep(len: number, includeStart: boolean, includeEnd: boolean) {
        if (!includeStart) {
            this.old = this.old.walk(0, 1)
            this.openOldWrappers()
        }
        this.old = this.old.walk(len, includeEnd ? 1 : -1, this.keepWalker)
        this.posB += len
    }

    replace(len: number, ins: number, includeStart: boolean) {
        let start = this.old.walk(0, 1),
            end = (this.old = start.walk(len, 1))
        this.build(ins, false, includeStart, start, end)
    }

    update(len: number, includeStart: boolean) {
        this.old = this.old.walk(0, 1)
        this.build(len, true, includeStart)
    }

    composition(composition: CompositionInfo, lenA: number) {
        this.leaveWrappers()
        if (!composition.target) {
            for (let mark of composition.wrapCursor!)
                if (mark.type.element) {
                    this.openWrapper(renderMarkWrapper(mark), mark.spanning, false)
                }
            this.new.addChild(new WidgetTile(imgHack, null, TileFlag.Point | TileFlag.PointBefore))
            return
        }
        let found: EltTile[] = []
        for (let parent = composition.target.parentNode; parent; parent = parent.parentNode) {
            let tile = parent.arrisaTile
            if (!tile) {
                let elt = Elt.create(parent.nodeName.toLowerCase(), takeAttributes(parent as Element), Elt.hole)
                tile = new EltTile(elt, null, 0, 0, parent as Element)
            } else if (tile.isNode || tile.isDoc) {
                break
            }
            found.push(tile as EltTile)
        }
        for (let i = found.length - 1; i >= 0; i--) {
            let tile = found[i]
            if (tile.isSpanning && this.enterSpanning(tile.elt)) {
            } else {
                if (tile.isSpanning && this.reused.has(tile)) {
                    let owner = tile.dom.arrisaTile
                    if (owner && owner != tile) owner.dom = (owner as EltTile).elt.outerDOM()
                } else {
                    this.reused.set(tile, Reused.DOM)
                }
                tile = EltTile.of(tile.elt, null, tile.flags, 0, tile.dom)
                this.new.addChild(tile)
                this.new = tile
            }
        }
        this.new.addChild(new TextTile(composition.text, composition.target, TileFlag.Composition))
        this.old = this.old.walk(lenA, 1)
        this.posB += composition.text.length
    }

    build(len: number, reuse: boolean, includeStart: boolean, startOld?: TilePointer, endOld?: TilePointer) {
        this.leaveWrappers()
        let start = this.posB,
            end = this.posB + len
        this.deco.walk(start, includeStart, end, {
            enter: (node, elt, wrappers) => {
                this.openWrappers(wrappers, reuse)
                let tile = this.buildNodeShape(node, elt, reuse ? this.old.tileAfter() : null) as EltTile
                this.new.addChild(tile)
                this.new = tile.contentTile!
                if (!this.new) throw new Error("Non-atom node rendered without hole")
                if (reuse) this.old = this.old.walk(1, 1)
                this.posB++
            },
            leave: () => {
                this.leaveNode()
                if (reuse) this.old = this.old.walk(1, 1)
                this.posB++
            },
            node: (node, shape, wrappers) => {
                this.openWrappers(wrappers, reuse)
                let wrapCount = wrappers.length
                if (node.is(Leaf.Text)) {
                    while (shape instanceof Elt) {
                        this.openWrapper(Elt.create(shape.tagName, shape.attrs, Elt.hole), true, reuse)
                        wrapCount++
                        shape = shape.children[0] as Decoration.Shape
                    }
                    let next =
                        (reuse || this.posB == start) &&
                        !(this.new.lastChild instanceof TextTile) &&
                        this.old.tileAfter()
                    if (!(next instanceof TextTile) || this.reused.has(next)) {
                        this.addText(node.param)
                    } else if (next.text == node.param && !(next.flags & TileFlag.Dirty)) {
                        this.reused.set(next, Reused.Full)
                        this.new.addChild(next)
                    } else {
                        this.reused.set(next, Reused.DOM)
                        this.new.addChild(new TextTile(node.param, next.dom))
                    }
                } else {
                    this.new.addChild(this.buildNodeShape(node, shape, reuse ? this.old.tileAfter() : null))
                }
                for (let i = 0; i < wrapCount; i++) this.up()
                if (reuse) this.old = this.old.walk(node.length, 1)
                this.posB += node.length
            },
            widget: (widget, side) => {
                let sideFlag = side < 0 ? TileFlag.PointBefore : side > 0 ? TileFlag.PointAfter : 0
                let tile = reuse
                    ? this.old.matchingWidget(widget, sideFlag, this.reused)
                    : startOld && this.posB == start
                      ? startOld.matchingWidget(widget, sideFlag, this.reused)
                      : endOld && this.posB == end
                        ? endOld.matchingWidget(widget, sideFlag, this.reused)
                        : null
                if (!tile) {
                    tile = new WidgetTile(widget, null, TileFlag.Point | sideFlag, 0)
                    if (widget.type.connect) this.toConnect.push(tile)
                }
                this.new.addChild(tile)
            },
        })
    }

    findReusableTile(shape: Decoration.Shape, reuse: Tile | readonly Tile[] | null, strict: boolean): Tile | null {
        if (reuse instanceof EltTile) {
            if (
                shape instanceof Elt &&
                reuse.elt.tagName == shape.tagName &&
                !this.reused.has(reuse) &&
                (!strict || Attributes.eq(reuse.elt.attrs, shape.attrs))
            )
                return reuse
            for (let ch of reuse.children)
                if (ch instanceof EltTile && ch.isNodeInner) {
                    let found = this.findReusableTile(shape, ch, strict)
                    if (found) return found
                }
            return this.findReusableTile(shape, reuse.children, strict)
        } else if (
            reuse instanceof WidgetTile &&
            shape instanceof Widget &&
            !this.reused.has(reuse) &&
            shape.eq(reuse.widget)
        ) {
            return reuse
        } else if (Array.isArray(reuse)) {
            for (let tile of reuse)
                if (tile.isNodeInner) {
                    let found = this.findReusableTile(shape, tile, strict)
                    if (found) return found
                }
        }
        return null
    }

    buildNodeShape(
        node: Node | null,
        shape: Decoration.Shape,
        reuse: Tile | readonly Tile[] | null,
        afterContent = TileFlag.None,
    ) {
        if (shape instanceof Elt) {
            let reusable,
                dom: Element | undefined,
                strict = true
            if (
                (reusable =
                    this.findReusableTile(shape, reuse, strict) ||
                    this.findReusableTile(shape, reuse, (strict = false)))
            ) {
                this.reused.set(reusable, Reused.DOM)
                dom = reusable.dom as Element
                if (reusable.flags & TileFlag.Dirty)
                    updateAttributes(dom, takeAttributes(reusable.dom as Element), shape.attrs)
                else if (!strict) updateAttributes(dom, (reusable as EltTile).elt.attrs, shape.attrs)
            }
            let flags =
                (node
                    ? shape.hasContent
                        ? TileFlag.None
                        : TileFlag.Atom
                    : TileFlag.NodeInner | (shape.hasContent ? TileFlag.None : TileFlag.Point)) | afterContent
            let tile = EltTile.of(shape, node, flags, node ? node.length : 0, dom)
            let afterContentInner = TileFlag.None
            for (let ch of shape.children) {
                if (ch === 0) {
                    afterContentInner = TileFlag.AfterContent
                    tile.flags |= TileFlag.PlotContent
                } else {
                    tile.addChild(
                        this.buildNodeShape(
                            null,
                            typeof ch == "string" ? Widget.Text.of(ch) : ch,
                            reusable ? reusable.children : reuse,
                            afterContentInner,
                        ),
                    )
                }
            }
            return tile
        } else {
            let reusable, dom: Element | Text | undefined
            if ((reusable = this.findReusableTile(shape, reuse, false))) {
                this.reused.set(reusable, Reused.DOM)
                dom = reusable.dom
            }
            let flags = (node ? TileFlag.Atom : TileFlag.Point | TileFlag.NodeInner) | afterContent
            let tile = new WidgetTile(shape, node, flags, node ? node.length : 0, dom)
            if (shape.type.connect) this.toConnect.push(tile)
            return tile
        }
    }

    addBR() {
        let node = this.new.node
        if (node && node.isPlot && node.isTextblock) {
            // Skip trailing point decorations (placeholders, etc.) — they are not
            // real content. Without a trailing BR, empty textblocks whose only
            // child is a contentEditable=false widget cannot host a caret and
            // native typing fails (placeholder stays, cursor stuck).
            let i = this.new.children.length - 1
            while (i >= 0) {
                let ch = this.new.children[i]
                if (ch instanceof WidgetTile && ch.widget.type == brHack.type) break
                if (ch.isPoint && !ch.isNodeInner) {
                    i--
                    continue
                }
                break
            }
            let last = i < 0 ? null : this.new.children[i]
            if (last instanceof WidgetTile && last.widget.type == brHack.type) {
                let j = i - 1
                while (j >= 0 && this.new.children[j].isPoint && !this.new.children[j].isNodeInner) j--
                let prev = j < 0 ? null : this.new.children[j]
                if (prev && prev.dom.nodeName != "BR") {
                    // Real content exists before the BR hack — drop it.
                    this.new.children.splice(i, 1)
                }
            } else if (!last || last.dom.nodeName == "BR") {
                this.new.addChild(new WidgetTile(brHack, null, TileFlag.Point | TileFlag.PointAfter, 0))
            }
        }
    }

    up() {
        this.addBR()
        this.new = this.new.parent!
    }

    leaveNode() {
        for (let inNode = true; ;) {
            if (!inNode && (this.new.isNode || this.new.isDoc)) break
            if (inNode && this.new.isNodeOuter) inNode = false
            this.up()
        }
    }

    leaveWrappers() {
        while (!(this.new.isNode || this.new.isDoc)) this.up()
    }

    openWrappers(wrappers: readonly WrapperSource[], reuse: boolean) {
        for (let src of wrappers) {
            this.openWrapper(renderWrapper(src), src.spanning, reuse)
        }
    }

    openOldWrappers() {
        let found: EltTile[] | undefined
        let start = this.old.tile.isText ? this.old.parent! : this.old
        for (let {tile, parent} = start; !tile.isNode && !tile.isDoc; {tile, parent} = parent!) {
            ;(found || (found = [])).push(tile as EltTile)
        }
        if (found)
            for (let i = found.length - 1; i >= 0; i--) {
                this.openWrapper(found[i].elt, found[i].isSpanning, true)
            }
    }

    openWrapper(elt: DecoElt, spanning: boolean, reuse: boolean) {
        let span = spanning && this.enterSpanning(elt)
        if (span) {
            this.new = span
        } else {
            let match = reuse ? this.old.matchingWrapper(elt, spanning, this.reused) : null
            let tile = EltTile.of(elt, null, TileFlag.Wrapper | (spanning ? TileFlag.Spanning : 0), 0, match)
            this.new.addChild(tile)
            this.new = tile
        }
    }

    enterSpanning(elt: DecoElt) {
        let cur = this.new
        for (let i = cur.children.length - 1; i >= 0; i--) {
            let prev = cur.children[i] as EltTile
            if (prev.isPoint) continue
            if (!prev.isSpanning || !prev.elt.eq(elt)) break

            if (prev.flags & TileFlag.Synced) {
                let copy = (cur.children[i] = EltTile.of(elt, null, prev.flags, 0, prev.dom))
                for (let ch of prev.children) copy.addChild(ch)
                prev = copy
                prev.parent = cur
            }

            for (let j = i + 1; j < cur.children.length; j++) prev.addChild(cur.children[j])
            return prev
        }
        return null
    }

    addText(text: string) {
        let last = this.new.lastChild
        if (!(last instanceof TextTile) || last.isComposition) {
            this.new.addChild(TextTile.of(text))
        } else if (last.flags & TileFlag.Synced) {
            this.new.children.pop()
            this.new.addChild(new TextTile(last.text + text, last.dom))
            this.reused.set(last, Reused.DOM)
        } else {
            last.text += text
            last.length += text.length
        }
    }

    finish() {
        while (!(this.new instanceof DocTile)) this.up()
        this.addBR()
        return this.new
    }
}

/**
 * Rewrite change sections so the composition range is a single insert
 * section with adjusted old length. Returns null if an insert only
 * partially overlaps `[comp.fromB, comp.toB]`.
 */
export function separateComposition(sections: ChangeSet.Sections, comp: CompositionInfo) {
    let result: number[] = [],
        {fromB, toB} = comp
    let lenI = 0,
        dLen = 0
    for (let posB = 0, done = false, i = 0; i < sections.length;) {
        let len = sections[i++],
            ins = sections[i++],
            endB = posB + (ins < 0 ? len : ins)
        if (fromB > endB || toB < posB) {
            result.push(len, ins)
        } else {
            if (ins >= 0) {
                if (posB < fromB || endB > toB) return null
                dLen = len - ins
            }
            if (posB < fromB) result.push(fromB - posB, ins)
            if (!done) {
                lenI = result.length
                result.push(0, comp.text.length)
                done = true
            }
            if (endB > toB) result.push(endB - toB, ins)
        }
        posB = endB
    }
    result[lenI] = comp.text.length + dLen
    return result
}
