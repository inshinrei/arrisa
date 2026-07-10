/**
 * Editor view geometry and scroll-target state.
 *
 * {@link ViewState} buffers transactions until flush, tracks content/scroller
 * sizes for geometry updates, and holds the active {@link ScrollTarget}.
 */
import {ChangeSet} from "@arrisa/doc"
import {EditorState, Transaction} from "@arrisa/state"
import type {Arrisa} from "../editor"
import {UpdateFlag} from "./flags"

/** Transaction effect that requests scrolling a range into view. */
export const scrollIntoView = Transaction.Effect.define<ScrollTarget>({map: (t, ch) => t.map(ch)})

const selectionScrollSpec: Required<Arrisa.ScrollSpec> = {
    x: "nearest",
    y: "nearest",
    xMargin: 5,
    yMargin: 5,
}

/** A document range (or point) to scroll into view, with strategy and margins. */
export class ScrollTarget {
    constructor(
        readonly from: number,
        readonly to: number,

        readonly assoc: -1 | 1,
        readonly spec: Required<Arrisa.ScrollSpec>,
    ) {}

    map(changes: ChangeSet) {
        if (changes.empty) return this
        let from: number, to: number
        if (this.from == this.to) {
            from = to = changes.mapPos(this.from, this.assoc)
        } else {
            from = changes.mapPos(this.from, 1)
            to = Math.max(from, changes.mapPos(this.to, -1))
        }
        return new ScrollTarget(from, to, this.assoc, this.spec)
    }

    clip(state: EditorState) {
        let len = state.doc.length
        return this.to <= len
            ? this
            : new ScrollTarget(Math.min(len, this.from), Math.min(len, this.to), this.assoc, this.spec)
    }
}

/**
 * Mutable view-side state: latest state, pending transactions, scroll target,
 * and measured geometry. Updated once per transaction; measured on read cycles.
 */
export class ViewState {
    initialized = false
    contentDOMWidth = 0
    contentDOMHeight = 0
    editorHeight = 0
    editorOffset = 0
    editorWidth = 0

    scrollTarget: ScrollTarget | null = null

    styleLTR: boolean = true

    flushedState: EditorState
    pending: Transaction[] = []

    constructor(public state: EditorState) {
        this.flushedState = state
    }

    update(tr: Transaction) {
        if (this.scrollTarget) this.scrollTarget = this.scrollTarget.map(tr.changes)
        if (tr.scrollIntoView) {
            let {selection: sel} = tr.state
            this.scrollTarget = new ScrollTarget(sel.head, sel.head, sel.headSide, selectionScrollSpec)
        }
        // Clip against the transaction's new state (positions refer to tr.state).
        for (let e of tr.effects) if (e.is(scrollIntoView)) this.scrollTarget = e.value.clip(tr.state)
        if (tr.startState != this.state) throw new Error("Mismatched transaction")
        this.pending = this.pending.concat(tr)
        this.state = tr.state
    }

    flush() {
        this.flushedState = this.state
        this.pending = []
    }

    measure(editor: Arrisa) {
        let dom = editor.contentDOM,
            style = window.getComputedStyle(dom)
        this.styleLTR = style.direction == "ltr"

        let domRect = dom.getBoundingClientRect()
        this.contentDOMHeight = domRect.height
        let result = 0

        if (this.editorWidth != editor.scrollDOM.clientWidth) {
            this.editorWidth = editor.scrollDOM.clientWidth
            result |= UpdateFlag.Geometry
        }

        let contentWidth = domRect.width
        if (
            this.contentDOMWidth != contentWidth ||
            this.editorHeight != editor.scrollDOM.clientHeight ||
            this.editorOffset != editor.scrollDOM.offsetTop
        ) {
            this.contentDOMWidth = domRect.width
            this.editorHeight = editor.scrollDOM.clientHeight
            this.editorOffset = editor.scrollDOM.offsetTop
            result |= UpdateFlag.Geometry
        }
        return result
    }

    initialMeasure(editor: Arrisa) {
        this.initialized = true
        let domRect = editor.contentDOM.getBoundingClientRect()
        this.contentDOMWidth = domRect.width
        this.contentDOMHeight = domRect.height
        this.editorHeight = editor.scrollDOM.clientHeight
        this.editorWidth = editor.scrollDOM.clientWidth
    }

    mapPosPending(pos: number, assoc: -1 | 1) {
        for (let tr of this.pending) pos = tr.changes.mapPos(pos, assoc)
        return pos
    }
}
