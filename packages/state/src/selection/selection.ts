/**
 * Editor selection model — public static factories on {@link EditorSelection}.
 *
 * Concrete subclasses import {@link ./base} to avoid circular init. Statics are
 * installed by {@link installEditorSelectionStatics}, which the package entry
 * calls so library tree-shaking cannot drop the wiring under `sideEffects: false`.
 */
import {type Leaf, type Plot, Pos} from "@arrisa/doc"
import {Facet} from "../state/facet"
import {TextblockMap} from "../textblock"
import {SelectionType} from "./type"
import {EditorSelection} from "./base"
import {Text as Text_} from "./text"
import {Node as Node_, setNodeNearFallback} from "./node"
import {Resolved as Resolved_} from "./resolved"
import {cursorAtStart, scanNormalFrom, skipWord as skipWordMotion} from "./motion"

/** Empty text selection (cursor) at `pos`. */
function cursor(pos: number, side?: -1 | 1, goalColumn?: number) {
    return Text_.createInner(pos, pos, side, goalColumn)
}

/** Text selection from `anchor` to `head` (defaults to a cursor at anchor). */
function range(anchor: number, head?: number, headSide?: -1 | 1, goalColumn?: number) {
    return Text_.createInner(anchor, head ?? anchor, headSide, goalColumn)
}

/** Select a selectable leaf node starting at document position `pos`. */
function node(pos: number, leaf: Leaf, goalColumn?: number) {
    return Node_.create(pos, leaf, goalColumn)
}

/** Closest valid text cursor near `pos`, preferring `bias` direction. */
function near(cx: EditorSelection.Context, pos: number, bias: -1 | 1 = 1): Text_ {
    let norm =
        scanNormalFrom(cx, pos, bias, bias > 0, false) ??
        scanNormalFrom(cx, pos, -bias as -1 | 1, bias < 0, false) ?? {pos: pos, side: -1}
    return cursor(norm.pos, norm.side)
}

/** Cursor at the visual start of the document or of `block`. */
function atStart(cx: EditorSelection.Context, block?: Pos.Plot) {
    return cursorAtStart(cx, block)
}

/** Cursor at the visual end of the document or of `block`. */
function atEnd(cx: EditorSelection.Context, block?: Pos.Plot) {
    let found = block
        ? TextblockMap.get(block.start, block.node, cx.config.textblockLTR(block.node)).visualSide(false)
        : cx.doc.inlineContent
          ? TextblockMap.get(0, cx.doc, cx.config.textblockLTR(cx.doc)).visualSide(false)
          : (scanNormalFrom(cx, cx.doc.length, -1, false, false) ?? {pos: cx.doc.length, side: -1})
    return cursor(found.pos, found.side)
}

function define<T extends EditorSelection, JSON extends object>(
    tag: string,
    cls: {new (...args: any[]): T},
    toJSON: (sel: T) => JSON,
    fromJSON: (doc: Plot.Doc, json: JSON) => T,
) {
    return EditorSelection.selectionType.of(new SelectionType(tag, cls, toJSON as any, fromJSON as any)) as any
}

let installed = false

/**
 * Attach factories, nested types, and `selectionType` on {@link EditorSelection}.
 * Idempotent. Must run from the package entry so the call is not tree-shaken.
 */
export function installEditorSelectionStatics() {
    if (installed) return EditorSelection
    installed = true

    let C = EditorSelection as typeof EditorSelection & {
        cursor: typeof cursor
        range: typeof range
        node: typeof node
        near: typeof near
        atStart: typeof atStart
        atEnd: typeof atEnd
        define: typeof define
        Text: typeof Text_
        Node: typeof Node_
        Resolved: typeof Resolved_
    }

    C.cursor = cursor
    C.range = range
    C.node = node
    C.near = near
    C.atStart = atStart
    C.atEnd = atEnd
    C.define = define
    C.Text = Text_
    C.Node = Node_
    C.Resolved = Resolved_
    C.createResolved = Resolved_.create

    C.selectionType = Facet.define<SelectionType>({
        combine(values) {
            let types = [C.Text.type, C.Node.type, ...values]
            for (let i = 0; i < types.length; i++)
                for (let j = i + 1; j < types.length; j++) {
                    if (types[i].tag == types[j].tag) throw new Error("Duplicate selection JSON tag: " + types[i].tag)
                }
            return types
        },
        static: true,
    })

    C.prototype.nextNormalCursor = function (this: EditorSelection, cx, forward = true) {
        let found = scanNormalFrom(cx, this.head, this.headSide, forward, true)
        return found && cursor(found.pos, found.side)
    }

    C.prototype.normalCursorAtBound = function (this: EditorSelection, cx, forward = true) {
        let found = scanNormalFrom(cx, forward ? this.to : this.from, forward ? -1 : 1, forward, false)
        return found && cursor(found.pos, found.side)
    }

    C.prototype.skipWord = function (this: EditorSelection, cx, forward = true) {
        let found = skipWordMotion(cx, this.head, this.headSide, forward)
        return found && cursor(found.pos, found.side)
    }

    setNodeNearFallback(near)
    return C
}

// Source / Vitest imports of this module need statics without the package entry.
// Dist builds may drop this call under sideEffects:false; package entry re-calls.
installEditorSelectionStatics()

export {EditorSelection}

declare module "./base" {
    interface EditorSelection {
        nextNormalCursor(cx: EditorSelection.Context, forward?: boolean): Text_ | null
        normalCursorAtBound(cx: EditorSelection.Context, forward?: boolean): Text_ | null
        skipWord(cx: EditorSelection.Context, forward?: boolean): Text_ | null
    }
    namespace EditorSelection {
        function cursor(pos: number, side?: -1 | 1, goalColumn?: number): Text_
        function range(anchor: number, head?: number, headSide?: -1 | 1, goalColumn?: number): Text_
        function node(pos: number, node: Leaf, goalColumn?: number): Node_
        function near(cx: EditorSelection.Context, pos: number, bias?: -1 | 1): Text_
        function atStart(cx: EditorSelection.Context, block?: Pos.Plot): Text_
        function atEnd(cx: EditorSelection.Context, block?: Pos.Plot): Text_
        function define<T extends EditorSelection, JSON extends object>(
            tag: string,
            cls: {new (...args: any[]): T},
            toJSON: (sel: T) => JSON,
            fromJSON: (doc: Plot.Doc, json: JSON) => T,
        ): any
        const Text: typeof Text_
        const Node: typeof Node_
        const Resolved: {
            create(doc: import("@arrisa/doc").Plot.Doc, selection: EditorSelection): import("./resolved").Resolved
        }
    }
}
