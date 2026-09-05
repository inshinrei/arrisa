/**
 * Leaf and element tiles: text, widgets, and decorated element shapes.
 */
import {findClusterBreak, EditorState, TextblockMap} from "@arrisa/state"
import {type Node} from "@arrisa/doc"
import type {Arrisa} from "../editor"
import {textRange, singleRect} from "../dom/dom"
import {Widget, type DecoElt} from "../decoration"
import {TileFlag, Reused} from "./flag"
import {CoordPos, ltrAt} from "./pos"
import {Tile, CompositeTile, Orientation, rowScan} from "./tile"


export class EltTile extends CompositeTile {
    declare dom: Element
    declare parent: CompositeTile

    constructor(
        readonly elt: DecoElt,
        readonly _node: Node | null,
        flags: number,
        length: number,
        dom: Element,
    ) {
        super(dom, flags)
        this.length = length
    }

    get isSpanning() {
        return (this.flags & TileFlag.Spanning) > 0
    }
    get isNodeOuter() {
        return !!this.node
    }
    get isAtom() {
        return !!this._node && (this.flags & TileFlag.Atom) > 0
    }
    get boundary() {
        return this._node && !(this.flags & TileFlag.Atom) ? 1 : 0
    }
    get node() {
        return this._node
    }

    get contentTile(): EltTile | null {
        if (!(this.flags & TileFlag.HasContent)) return null
        for (let ch of this.children)
            if (ch.isNodeInner && ch.flags & TileFlag.HasContent) return (ch as EltTile).contentTile
        return this
    }

    static of(elt: DecoElt, node: Node | null, flags: number, length: number, dom?: Element | null) {
        if (elt.hasContent) {
            flags |= TileFlag.HasContent
            if (elt.children.length > 1) {
                let zero = elt.children.indexOf(0)
                if (zero > -1 && zero < elt.children.length - 1) flags |= TileFlag.ContentNotLast
            }
        }
        return new EltTile(elt, node, flags, length, dom || elt.outerDOM())
    }
}

export class WidgetTile extends Tile {
    constructor(
        readonly widget: Widget<any>,
        readonly _node: Node | null,
        flags: TileFlag,
        length: number = 0,
        dom?: Element | Text,
    ) {
        super(dom || widget.type.render(widget.value), flags)
        this.length = length
        // Non-text widgets are non-editable chrome (placeholders, hacks, atoms).
        // Without contentEditable=false, the caret can enter the widget DOM and
        // typing will not map to document changes.
        if (
            this.dom.nodeType == 1 &&
            widget.type != Widget.EditableText &&
            (this.dom as HTMLElement).contentEditable != "false"
        ) {
            ;(this.dom as HTMLElement).contentEditable = "false"
        }
    }

    get isNodeOuter() {
        return !!this._node
    }
    get isAtom() {
        return true
    }
    get node() {
        return this._node
    }

    get children() {
        return noChildren
    }

    handleEvent(event: Event, editor: Arrisa) {
        return this.widget.type.handleEvent(event, editor)
    }

    connect() {
        this.widget.type.connect?.(this.widget.value, this.dom)
    }

    disconnect(reused?: Map<Tile, Reused>) {
        if (!reused || reused.get(this) != Reused.Full) this.widget.type.disconnect?.(this.widget.value, this.dom)
    }

    toString() {
        return this.widget.type == Widget.EditableText || this.widget.type == Widget.Text
            ? JSON.stringify(this.widget.value)
            : super.toString()
    }

    posAtCoordsInner(
        start: number,
        state: EditorState,
        x: number,
        y: number,
        textblock: TextblockMap | null,
        orientation: Orientation,
    ): CoordPos {
        if (!this.node) return CoordPos.create(start, 1)
        let rect =
            this.dom.nodeType == 1
                ? (this.dom as Element).getBoundingClientRect()
                : textRange(this.dom as Text, 0, this.length).getBoundingClientRect()
        let after =
            orientation == Orientation.Col
                ? y > (rect.top + rect.bottom) / 2
                : x < (rect.left + rect.right) / 2 == ltrAt(state, start, 1, textblock)
        return after
            ? CoordPos.create(start + this.length - 2 * this.boundary, -1, start)
            : CoordPos.create(start, 1, start)
    }
}

export class TextTile extends Tile {
    declare dom: Text

    constructor(
        public text: string,
        dom: Text,
        flags: TileFlag = TileFlag.None,
    ) {
        super(dom, flags)
        this.length = text.length
    }

    get children() {
        return noChildren
    }

    get isText() {
        return true
    }
    get isNodeOuter() {
        return true
    }
    get isAtom() {
        return true
    }

    static of(text: string) {
        return new TextTile(text, document.createTextNode(text))
    }

    sync() {
        if (this.flags & TileFlag.Synced) return
        this.flags |= TileFlag.Synced
        if (this.dom.nodeValue != this.text) this.dom.nodeValue = this.text
    }

    toString() {
        return JSON.stringify(this.text)
    }

    posAtCoordsInner(
        start: number,
        state: EditorState,
        x: number,
        y: number,
        textblock: TextblockMap | null,
        orientation: Orientation,
    ): CoordPos {
        let {closest, rect} = rowScan<number>(x, y, (add) => {
            for (let i = 0; i < this.length;) {
                let end = findClusterBreak(this.text, i)
                let rect = singleRect(textRange(this.dom, i, end), 1, true)
                if (rect.top == rect.bottom) continue
                if (add(rect, i)) break
                i = end
            }
        })!
        let pos = start + closest
        let after = x > (rect.left + rect.right) / 2 == ltrAt(state, pos, 1, textblock)
        if (after) return CoordPos.create(start + findClusterBreak(this.text, closest), -1)
        else return CoordPos.create(pos, 1)
    }
}

export const noChildren: Tile[] = []


