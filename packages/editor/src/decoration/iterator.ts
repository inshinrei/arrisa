/**
 * Walk document content with active decorations, producing a stream of
 * enter/leave/node/widget events for the tile renderer.
 *
 * {@link HeapIterator} merges range start/end events with point decorations
 * in document order (by position, then side / inclusivity).
 */
import {Attributes, Elt, Leaf, Mark, Node, type Plot, Pos, Schema} from "@arrisa/doc"
import {EditorState} from "@arrisa/state"
import {Widget} from "./widget"
import {
    Decoration,
    type DecoElt,
    AttributeRangeDecoration,
    WrapperRangeDecoration,
    ShapeDecoration,
    WidgetDecoration,
    WidgetPlace,
    DecorationScope,
    type TagShape,
    type TagWidget,
    type TagWrapper,
    type TagAttribute,
    tagShape,
    tagWidget,
    tagWrapper,
    tagAttribute,
    memo,
    applyDeco,
    baseTagShape,
} from "./decoration"
import {PointSet, PointIterator} from "./point-set"
import {RangeSet, RangeIterator} from "./range-set"
import type {DecoSet} from "./deco-set"

const none: readonly any[] = []

export interface DecoWalker {
    enter(node: Plot, shape: DecoElt, wrappers: readonly WrapperSource[]): void
    leave(): void
    node(node: Node, shape: Decoration.Shape, wrappers: readonly WrapperSource[]): void
    widget(widget: Widget, side: number): void
}

/**
 * Min-heap merge of active ranges and points over `[start, end)`.
 * Each {@link HeapIterator.next} advances to the next boundary or point.
 */
export class HeapIterator<R extends RangeSet.Value, P extends PointSet.Value> {
    active: RangeIterator<R>[] = []
    from: number
    to: number
    point: PointIterator<P> | null = null
    done = false

    constructor(
        readonly rangeHeap: RangeIterator<R>[],
        readonly pointHeap: PointIterator<P>[],
        start: number,
        readonly end: number,
    ) {
        for (let i = rangeHeap.length >> 1; i >= 0; i--) bubble(rangeHeap, i, cmpRangeFrom)
        for (let i = pointHeap.length >> 1; i >= 0; i--) bubble(pointHeap, i, cmpPoint)
        this.from = this.to = start
    }

    next() {
        if (this.done) return this
        if (this.point) {
            this.point.next()
            if (this.point.done) popHeap(this.pointHeap, cmpPoint)
            else bubble(this.pointHeap, 0, cmpPoint)
            this.point = null
        }
        let {rangeHeap, pointHeap, active} = this
        while (true) {
            let [startPos, startSide] = rangeHeap.length
                ? [rangeHeap[0].from, rangeHeap[0].value!.inclusiveStart ? -1 : 1]
                : [1e9, 0]
            let [endPos, endSide] = active.length ? [active[0].to, active[0].value!.inclusiveEnd ? 1 : -1] : [1e9, 0]
            let {pos: pointPos, side: pointSide} = pointHeap.length ? pointHeap[0] : {pos: 1e9, side: 1}
            let nextPos = Math.min(startPos, endPos, pointPos)
            if (this.to == this.end && nextPos > this.to) {
                this.done = true
                break
            } else if (nextPos > this.to) {
                this.from = this.to
                this.to = Math.min(this.end, nextPos)
                break
            } else if (
                pointPos == nextPos &&
                (startPos > pointPos || pointSide < 0) &&
                (endPos > pointPos || pointSide < 0)
            ) {
                this.point = this.pointHeap[0]
                this.from = this.to = pointPos
                break
            } else if ((startPos - endPos || startSide - endSide) < 0) {
                let first = rangeHeap[0]
                sink(active, active.push(first) - 1, cmpRangeTo)
                popHeap(rangeHeap, cmpRangeFrom)
            } else {
                let first = active[0]
                first.next()
                if (!first.done) sink(rangeHeap, rangeHeap.push(first) - 1, cmpRangeFrom)
                popHeap(active, cmpRangeTo)
            }
        }
        return this
    }
}

function bubble<T>(heap: T[], index: number, cmp: (a: T, b: T) => number) {
    for (let cur = heap[index]; ;) {
        let childIndex = (index << 1) + 1
        if (childIndex >= heap.length) break
        let child = heap[childIndex]
        if (childIndex + 1 < heap.length && cmp(child, heap[childIndex + 1]) >= 0) {
            child = heap[childIndex + 1]
            childIndex++
        }
        if (cmp(cur, child) < 0) break
        heap[childIndex] = cur
        heap[index] = child
        index = childIndex
    }
}

function sink<T>(heap: T[], index: number, cmp: (a: T, b: T) => number) {
    let elt = heap[index]
    while (index > 0) {
        let parent = (index - 1) >> 1
        if (cmp(heap[parent], elt) < 0) break
        heap[index] = heap[parent]
        heap[parent] = elt
        index = parent
    }
}

function popHeap<T>(heap: T[], cmp: (a: T, b: T) => number) {
    let last = heap.pop()!
    if (heap.length) {
        heap[0] = last
        bubble(heap, 0, cmp)
    }
}

function cmpBool(a: boolean, b: boolean) {
    return a ? (b ? 0 : 1) : b ? -1 : 0
}

function cmpRangeFrom(a: RangeIterator<RangeSet.Value>, b: RangeIterator<RangeSet.Value>) {
    return a.from - b.from || cmpBool(b.value!.inclusiveStart, a.value!.inclusiveStart)
}

function cmpRangeTo(a: RangeIterator<RangeSet.Value>, b: RangeIterator<RangeSet.Value>) {
    return a.to - b.to || cmpBool(a.value!.inclusiveEnd, b.value!.inclusiveEnd)
}

function cmpPoint(a: PointIterator<PointSet.Value>, b: PointIterator<PointSet.Value>) {
    return a.pos - b.pos || a.side - b.side
}

export type WrapperSource = Mark<any> | WrapperRangeDecoration

function nodeWrappers(
    schema: Schema,
    tag: Node.Tag,
    active: readonly RangeIterator<Decoration.Range>[],
    atom: boolean,
): readonly WrapperSource[] {
    let wrappers: WrapperSource[] | undefined

    for (let mark of tag.marks) if (mark.type.element) (wrappers || (wrappers = [])).push(mark)
    if (active.length) {
        for (let cur of active) {
            let val = cur.value!
            if (
                val instanceof WrapperRangeDecoration &&
                tagScope(tag, atom) & val.scope &&
                (!val.query || schema.matchNode(tag.type, val.query))
            )
                (wrappers || (wrappers = [])).push(val)
        }
    }

    if (!wrappers) return none
    if (wrappers.length > 1)
        wrappers.sort((a, b) => (a.spanning == b.spanning ? 0 : a.spanning ? -1 : 1) || a.rank - b.rank)
    return wrappers
}

function tagScope(tag: Node.Tag, atom: boolean): DecorationScope {
    return (
        DecorationScope.All | (atom ? DecorationScope.Atom | (tag.type.isInline ? DecorationScope.InlineAtom : 0) : 0)
    )
}

export function renderWrapper(src: WrapperSource): DecoElt {
    if (src instanceof WrapperRangeDecoration) return src.elt
    return renderMarkWrapper(src)
}

export const renderMarkWrapper = memo((mark: Mark<any>) => {
    let shape = mark.type.element!
    return Elt.create(shape.name, shape.attrs(mark.value), Elt.hole)
})

export class DecoIterator {
    tagShapes: readonly TagShape[]
    globalWidgets: readonly TagWidget[]
    globalWrappers: readonly TagWrapper[]
    globalAttrs: readonly TagAttribute[]
    schema: Schema
    pos: Pos
    rangeIter: RangeIterator<Decoration.Range>[] = []
    pointIter: PointIterator<Decoration.Point>[] = []

    constructor(
        readonly state: EditorState,
        readonly decoSet: DecoSet,
    ) {
        this.tagShapes = state.facet(tagShape)
        this.globalWidgets = state.facet(tagWidget)
        this.globalWrappers = state.facet(tagWrapper)
        this.globalAttrs = state.facet(tagAttribute)
        this.pos = state.doc.resolve(0)
        this.schema = state.schema
        for (let s of state.facet(Decoration.Range.source)) {
            let set = decoSet.ranges.get(s)
            if (set?.length) this.rangeIter.push(set.iter())
        }
        for (let s of state.facet(Decoration.Point.source)) {
            let set = decoSet.points.get(s)
            if (set?.length) this.pointIter.push(set.iter())
        }
    }

    widgets(tag: Node.Tag, place: WidgetPlace, walker: DecoWalker) {
        for (let src of this.globalWidgets) {
            if (src.place == place && tag.type == src.type) {
                let widget = src.widget(tag)
                if (widget) walker.widget(widget, place == WidgetPlace.Before || place == WidgetPlace.End ? 1 : -1)
            }
        }
    }

    walk(from: number, inclusiveStart: boolean, to: number, walker: DecoWalker) {
        for (let i of this.rangeIter) i.goto(from)
        for (let i of this.pointIter) i.goto(inclusiveStart ? from : from + 1)
        let iter = new HeapIterator<Decoration.Range, Decoration.Point>(
            this.rangeIter.filter((i) => !i.done),
            this.pointIter.filter((i) => !i.done),
            from,
            to,
        )
        let pos = this.pos.advance(from - this.pos.pos),
            started = inclusiveStart

        let pendingDeco: Decoration.Point[] = [],
            pendingPos = -1
        let pendingShape: ShapeDecoration | null = null,
            pendingShapeSet: PointSet | null = null

        let wrap: Pos.Walker = {
            skip: (node, pos) => {
                if (started) this.widgets(node.tag, WidgetPlace.Before, walker)
                else started = true
                let hasPending = pendingPos == pos && !node.isText
                let shape = hasPending && pendingShape ? pendingShape.shape : this.tagShape(node.tag, iter.active)
                if (hasPending) for (let deco of pendingDeco) shape = applyDeco(shape, deco, node.tag)
                if (shape.hasContent) throw new Error("Leaf nodes shapes shouldn't have a content hole")
                walker.node(node, shape, nodeWrappers(this.schema, node.tag, iter.active, true))
                this.widgets(node.tag, WidgetPlace.After, walker)
            },
            enterPlot: (node, pos) => {
                if (started) this.widgets(node.tag, WidgetPlace.Before, walker)
                else started = true
                let shape =
                    pendingShape && pendingPos == pos ? pendingShape.shape : this.tagShape(node.tag, iter.active)
                if (pendingPos == pos) for (let deco of pendingDeco) shape = applyDeco(shape, deco, node.tag)
                let wrappers = nodeWrappers(this.schema, node.tag, iter.active, !shape.hasContent)
                let atom = !shape.hasContent
                if (atom) walker.node(node!, shape, wrappers)
                else walker.enter(node!, shape as DecoElt, wrappers)
                this.widgets(node.tag, WidgetPlace.Start, walker)
                return !atom
            },
            leavePlot: (tag) => {
                if (started) this.widgets(tag, WidgetPlace.End, walker)
                else started = true
                walker.leave()
                this.widgets(tag, WidgetPlace.After, walker)
            },
        }

        if (inclusiveStart) {
            let before = pos.nodeBefore
            if (before) this.widgets(before.tag, WidgetPlace.After, walker)
            else this.widgets(pos.parent.node.tag, WidgetPlace.Start, walker)
        }

        for (; !iter.next().done;) {
            if (iter.point) {
                let value = iter.point.value!
                if (value instanceof WidgetDecoration) {
                    walker.widget(value.widget, value.side)
                } else {
                    if (pendingPos < pos.pos) {
                        pendingDeco.length = 0
                        pendingShape = null
                        pendingPos = pos.pos
                    }
                    if (
                        value instanceof ShapeDecoration &&
                        (!pendingShape || compareSetPrec(pendingShapeSet!, iter.point.set, this.pointIter))
                    ) {
                        pendingShape = value
                        pendingShapeSet = iter.point.set
                    } else {
                        pendingDeco.push(value)
                    }
                }
            } else {
                pos = pos.walk(iter.to - iter.from, wrap)
            }
        }
        if (pos.pos < to) pos = pos.walk(to - pos.pos, wrap)

        let after = pos.nodeAfter
        if (after) this.widgets(after!.tag, WidgetPlace.Before, walker)
        else this.widgets(pos.parent.node.tag, WidgetPlace.End, walker)
        this.pos = pos
    }

    tagShape(tag: Node.Tag, active: RangeIterator<Decoration.Range>[]) {
        let shape
        if (!tag.is(Leaf.Text))
            for (let src of this.tagShapes)
                if (src.type == tag.type) {
                    shape = src.shape(tag)
                    break
                }
        if (!shape) shape = baseTagShape(tag)
        let add: string[] | undefined
        for (let src of this.globalAttrs)
            if (tag.type == src.type) {
                if (src.target && shape instanceof Elt) shape = shape.addAttrs([src.attr, src.value(tag)], src.target)
                else Attributes.push(add || (add = []), src.attr, src.value(tag))
            }
        let scope = tagScope(tag, !shape.hasContent)
        for (let {type, elt, target} of this.globalWrappers)
            if (tag.type == type) {
                shape = target && shape instanceof Elt ? shape.wrap(elt, target) : elt.fill([shape])
            }
        for (let iter of active) {
            let deco = iter.value!
            if (
                deco instanceof AttributeRangeDecoration &&
                scope & deco.scope &&
                (!deco.query || this.schema.matchNode(tag.type, deco.query))
            )
                Attributes.push(add || (add = []), deco.attribute, deco.value)
        }
        if (add) {
            if (shape instanceof Elt)
                shape = Elt.create(shape.tagName, Attributes.merge(shape.attrs, add), shape.children)
            else shape = Elt.create(tag.type.isBlock ? "div" : "span", add, [shape])
        }
        return shape
    }
}

function compareSetPrec(setA: PointSet, setB: PointSet, array: readonly PointIterator<PointSet.Value>[]) {
    if (setA != setB)
        for (let i of array) {
            if (i.set == setA) return -1
            if (i.set == setB) return 1
        }
    return 0
}
