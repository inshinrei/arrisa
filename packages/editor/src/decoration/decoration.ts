/**
 * Decoration model: point and range decorations, tag-shape facets, and
 * helpers that apply attributes/wrappers to node shapes.
 *
 * Point decorations sit at a position (widgets, attrs, shape overrides).
 * Range decorations span content (attribute/wrapper ranges with inclusivity).
 */
import {Attributes, Elt, Leaf, Node, type ChangeSet} from "@arrisa/doc"
import {EditorState, EditorSelection} from "@arrisa/state"
import {Widget} from "./widget"
import {PointSet} from "./point-set"
import {RangeSet} from "./range-set"

/** Element shape used for decorated DOM (may embed widgets or text). */
export type DecoElt = Elt<Widget | string>

export namespace Decoration {
    export type Shape = Widget | DecoElt

    export namespace Tag {
        export function shape<T extends Node.Type.Ref<any>>(type: T, shape: Shape | ((tag: Node.Tag.For<T>) => Shape)): EditorState.Extension {
            let tp = Node.Type.get(type)
            let shapeFunc: (tag: Node.Tag) => Shape =
                typeof shape == "function"
                    ? (tag) => addMarkAttributes(shape(tag as any), tag)
                    : (tag) => addMarkAttributes(shape, tag)
            return tagShape.of({type: tp, shape: memo(shapeFunc)})
        }

        export namespace shape {
            export function dynamic<T extends Node.Type.Ref<any>>(
                type: T,
                shape: (state: EditorState) => Shape | ((tag: Node.Tag.For<T>) => Shape),
            ): EditorState.Extension {
                let tp = Node.Type.get(type)
                return tagShape.compute((state) => {
                    let s = shape(state)
                    return {type: tp, shape: typeof s == "function" ? memo(s as any) : () => s}
                })
            }
        }

        export function wrapper(
            type: Node.Type.Ref<any>,
            wrapper: DecoElt,
            options?: {
                target?: string
            },
        ): EditorState.Extension {
            if (!wrapper.hasContent) throw new Error("Wrapper elements should have a content hole")
            return tagWrapper.of({
                type: Node.Type.get(type),
                elt: wrapper,
                target: options && options.target ? Elt.Selector.parse(options.target) : null,
            })
        }

        function getPlace(place: "before" | "after" | "start" | "end") {
            return place == "before"
                ? WidgetPlace.Before
                : place == "after"
                  ? WidgetPlace.After
                  : place == "end"
                    ? WidgetPlace.End
                    : WidgetPlace.Start
        }

        export function widget<T extends Node.Type.Ref<any>>(
            type: T,
            place: "before" | "after" | "start" | "end",
            widget: Widget | ((tag: Node.Tag.For<T>) => Widget),
        ): EditorState.Extension {
            return tagWidget.of({
                type: Node.Type.get(type),
                place: getPlace(place),
                widget: typeof widget == "function" ? memo(widget as any) : () => widget,
            })
        }

        export namespace widget {
            export function dynamic<T extends Node.Type.Ref<any>>(
                type: T,
                place: "before" | "after" | "start" | "end",
                widget: (state: EditorState) => Widget | ((tag: Node.Tag.For<T>) => Widget),
            ): EditorState.Extension {
                let tp = Node.Type.get(type)
                let p = getPlace(place)
                return tagWidget.compute((state) => {
                    let w = widget(state)
                    return {
                        type: tp,
                        place: p,
                        widget: typeof w == "function" ? memo(w as any) : () => w,
                    }
                })
            }
        }

        export function attribute<T extends Node.Type.Ref<any>>(
            type: T,
            attr: string,
            value: string | ((tag: Node.Tag.For<T>) => string),
            options?: {target?: string},
        ): EditorState.Extension {
            let tp = Node.Type.get(type)
            return tagAttribute.of({
                type: tp,
                attr,
                value: typeof value == "string" ? () => value : (value as any),
                target: options?.target ? Elt.Selector.parse(options.target) : null,
            })
        }
    }

    export abstract class Point implements PointSet.Value {
        static source = EditorState.Facet.define<(state: EditorState) => PointSet<Point>>({
            combine: (sources) => sources.concat(nodeSelection),
        })
        abstract side: number
        abstract trackMode: ChangeSet.TrackMode | undefined

        constructor() {}

        static widget(
            widget: Widget,
            options?: {
                side?: number

                trackMode?: ChangeSet.TrackMode | undefined
            },
        ): Point {
            return new WidgetDecoration(
                widget,
                options?.side || 0,
                options && "trackMode" in options ? options.trackMode : "around",
            )
        }

        static attributes(attrs: Record<string, string>, options?: {target?: string}): Point {
            return new AttributeDecoration(
                Attributes.read(attrs),
                options?.target ? Elt.Selector.parse(options.target) : null,
            )
        }

        static shape(shape: Shape): Point {
            return new ShapeDecoration(shape)
        }

        static wrapper(wrapper: DecoElt, spec?: {target?: string}): Point {
            if (!wrapper.hasContent) throw new Error("Wrapper decoration elements must have a content hole")
            return new WrapperDecoration(wrapper, spec?.target ? Elt.Selector.parse(spec.target) : null)
        }

        abstract eq(other: PointSet.Value): boolean
    }

    export abstract class Range implements RangeSet.Value {
        static source = EditorState.Facet.define<(state: EditorState) => RangeSet<Range>>()

        readonly query: Node.Query | null

        readonly scope: DecorationScope

        readonly inc: Inc

        protected constructor(spec: Decoration.Range.Spec) {
            let {query, inclusive} = spec
            this.query = query || null
            this.scope =
                spec.scope == "inlineatom"
                    ? DecorationScope.InlineAtom
                    : spec.scope == "all"
                      ? DecorationScope.All
                      : DecorationScope.Atom
            this.inc =
                inclusive === "start"
                    ? Inc.Start
                    : inclusive === "end"
                      ? Inc.End
                      : inclusive
                        ? Inc.Start | Inc.End
                        : Inc.None
        }

        get inclusiveStart() {
            return (this.inc & Inc.Start) > 0
        }

        get inclusiveEnd() {
            return (this.inc & Inc.End) > 0
        }

        static wrapper(tagName: string, spec: Decoration.Range.WrapperSpec): Range {
            return new WrapperRangeDecoration(tagName, spec)
        }

        static attribute(attr: string, value: string, options: Decoration.Range.Spec = {}): Range {
            return new AttributeRangeDecoration(attr, value, options)
        }

        abstract eq(other: RangeSet.Value): boolean
    }

    export namespace Range {
        export interface Spec {
            inclusive?: boolean | "start" | "end"

            query?: Node.Query

            scope?: "atom" | "inlineatom" | "all"
        }

        export interface WrapperSpec extends Decoration.Range.Spec {
            attributes?: Record<string, string>

            rank?: number

            spanning?: boolean
        }
    }
}

export type TagShape = {type: Node.Type; shape: (tag: Node.Tag) => Decoration.Shape}

export const tagShape = EditorState.Facet.define<TagShape>()

export type TagWrapper = {type: Node.Type; elt: DecoElt; target: Elt.Selector | null}

export const tagWrapper = EditorState.Facet.define<TagWrapper>()

export const enum WidgetPlace {
    Before,
    After,
    Start,
    End,
}

export type TagWidget = {type: Node.Type; place: WidgetPlace; widget: (tag: Node.Tag) => Widget}

export const tagWidget = EditorState.Facet.define<TagWidget>()

export type TagAttribute = {
    type: Node.Type
    attr: string
    value: (tag: Node.Tag) => string
    target: Elt.Selector | null
}

export const tagAttribute = EditorState.Facet.define<TagAttribute>()

/** WeakMap-memoize a single-argument function (used for tag → shape caches). */
export function memo<T, A extends Object>(f: (arg: A) => T) {
    let map = new WeakMap<A, T>()
    return (arg: A) => {
        let found = map.get(arg)
        if (found === undefined) map.set(arg, (found = f(arg)))
        return found
    }
}

export function addMarkAttributes(shape: Decoration.Shape, tag: Node.Tag) {
    let attrs: readonly string[] | undefined
    for (let mark of tag.marks) {
        if (mark.type.attribute && (mark.spanning || !tag.isText)) {
            let {get, target} = mark.type.attribute
            let markAttrs = get(mark.value)
            if (markAttrs.length) {
                if (target && shape instanceof Elt) shape = shape.addAttrs(markAttrs, target)
                else attrs = attrs ? Attributes.merge(attrs, markAttrs) : markAttrs
            }
        }
    }
    return attrs ? addAttrs(shape, attrs, tag.type.isInline) : shape
}

export function addAttrs(shape: Decoration.Shape, attrs: Attributes, inline: boolean) {
    return shape instanceof Elt ? shape.addAttrs(attrs) : Elt.create(inline ? "span" : "div", attrs, [shape])
}

export function applyDeco(shape: Decoration.Shape, deco: Decoration.Point, tag: Node.Tag) {
    if (deco instanceof AttributeDecoration) {
        return deco.selector && shape instanceof Elt
            ? shape.addAttrs(deco.attrs, deco.selector)
            : addAttrs(shape, deco.attrs, tag.type.isInline)
    } else if (deco instanceof WrapperDecoration) {
        return deco.selector && shape instanceof Elt ? shape.wrap(deco.elt, deco.selector) : deco.elt.fill([shape])
    }
    return shape
}

export const baseTagShape = memo((tag: Node.Tag): Decoration.Shape => {
    return addMarkAttributes(
        tag.is(Leaf.Text) ? Widget.EditableText.of(tag.param as string) : tag.type.shape.create(tag.param),
        tag,
    )
})

export const enum DecorationScope {
    Atom = 1,
    InlineAtom = 2,
    All = 4,
}

export const enum Inc {
    None = 0,
    Start = 1,
    End = 2,
}

export class AttributeRangeDecoration extends Decoration.Range {
    constructor(
        readonly attribute: string,
        readonly value: string,
        options: Decoration.Range.Spec,
    ) {
        super(options)
    }

    eq(other: RangeSet.Value): boolean {
        return (
            this == other ||
            (other instanceof AttributeRangeDecoration &&
                other.attribute == this.attribute &&
                other.value == this.value &&
                other.inc == this.inc)
        )
    }
}

export class WrapperRangeDecoration extends Decoration.Range {
    readonly elt: Elt
    readonly rank: number
    readonly spanning: boolean

    constructor(element: string, spec: Decoration.Range.WrapperSpec) {
        super(spec)
        let {attributes} = spec
        this.rank = Math.max(0, Math.min(spec.rank ?? 100))
        this.spanning = spec.spanning !== false
        this.elt = Elt.create(element, attributes ? Attributes.read(attributes) : Attributes.none, Elt.hole)
    }

    eq(other: RangeSet.Value): boolean {
        return (
            this == other ||
            (other instanceof WrapperRangeDecoration &&
                other.elt.eq(this.elt) &&
                other.rank == this.rank &&
                other.spanning == this.spanning &&
                other.inc == this.inc)
        )
    }
}

export class ShapeDecoration extends Decoration.Point {
    constructor(readonly shape: Decoration.Shape) {
        super()
    }

    get trackMode() {
        return "after" as const
    }

    get side() {
        return 1e9
    }

    eq(other: PointSet.Value): boolean {
        return this == other || (other instanceof ShapeDecoration && other.shape.eq(this.shape))
    }
}

export class WidgetDecoration extends Decoration.Point {
    constructor(
        readonly widget: Widget,
        readonly side: number,
        readonly trackMode: ChangeSet.TrackMode | undefined,
    ) {
        super()
        if (side >= 1e9) throw new Error("Invalid widget side")
    }

    eq(other: PointSet.Value): boolean {
        return (
            this == other ||
            (other instanceof WidgetDecoration &&
                other.widget.eq(this.widget) &&
                other.side == this.side &&
                other.trackMode == this.trackMode)
        )
    }
}

function selectorEq(a: Elt.Selector | null, b: Elt.Selector | null) {
    return a ? !!b && a.eq(b) : !b
}

export class AttributeDecoration extends Decoration.Point {
    constructor(
        readonly attrs: Attributes,
        readonly selector: Elt.Selector | null,
    ) {
        super()
    }

    get trackMode() {
        return "after" as const
    }

    get side() {
        return 1e9
    }

    eq(other: PointSet.Value): boolean {
        return (
            this == other ||
            (other instanceof AttributeDecoration &&
                Attributes.eq(other.attrs, this.attrs) &&
                selectorEq(other.selector, this.selector))
        )
    }
}

export class WrapperDecoration extends Decoration.Point {
    constructor(
        readonly elt: DecoElt,
        readonly selector: Elt.Selector | null,
    ) {
        super()
    }

    get trackMode() {
        return "after" as const
    }

    get side() {
        return 1e9
    }

    eq(other: PointSet.Value): boolean {
        return (
            this == other ||
            (other instanceof WrapperDecoration && other.elt.eq(this.elt) && selectorEq(other.selector, this.selector))
        )
    }
}

export const nodeSelectionDeco = Decoration.Point.attributes({class: "arrisa-selected-node"})

export function nodeSelection(state: EditorState) {
    if (state.selection instanceof EditorSelection.Node) {
        let {node, from} = state.selection
        if (node.isLeaf && node.type.isSelectable) return PointSet.create([[from, nodeSelectionDeco]])
    }
    return PointSet.empty
}
