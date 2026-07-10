/**
 * Abstract selection base (no imports of concrete Text/Node types — avoids
 * circular module init with those subclasses).
 *
 * Static factories and motion helpers live on {@link ./selection}.
 */
import {type ChangeSet, type Plot} from "@arrisa/doc"
import type {EditorState} from "../state/state"
import type {Configuration} from "../state/configuration"
import type {SelectionType} from "./type"
import type {Resolved} from "./resolved"

export abstract class EditorSelection {
    declare static selectionType: import("../state/facet").Facet<SelectionType>

    /** Filled by `./resolved` to avoid a base↔resolved import cycle. */
    static createResolved: (doc: Plot.Doc, selection: EditorSelection) => Resolved

    protected constructor(
        readonly anchor: number,
        readonly head: number,
        readonly goalColumn?: number,
    ) {}

    get from() {
        return Math.min(this.anchor, this.head)
    }

    get to() {
        return Math.max(this.anchor, this.head)
    }

    get empty(): boolean {
        return this.anchor == this.head
    }

    /** True only for empty text selections; overridden by {@link Text}. */
    get isCursor(): boolean {
        return false
    }

    get ranges(): readonly {from: number; to: number}[] {
        return [this]
    }

    get replacementRange(): {from: number; to: number} {
        return this
    }

    get domSelection(): {head: number; headSide: -1 | 1; anchor: number; anchorSide: -1 | 1} {
        return this
    }

    get headSide(): -1 | 1 {
        return this.head > this.anchor ? -1 : 1
    }

    get anchorSide(): -1 | 1 {
        return this.anchor > this.head ? -1 : 1
    }

    static fromJSON(cx: EditorSelection.Context, json: unknown): EditorSelection {
        let {doc, config} = cx,
            tag = (json as any).type as string
        let types = config.staticFacet(EditorSelection.selectionType)
        let type = types.find((tp) => tp.tag == tag)
        if (!type) throw new Error(`Unknown selection type '${tag}' in EditorSelection.fromJSON`)
        return type.fromJSON(doc, json)
    }

    abstract eq(other: EditorSelection): boolean

    /** Compare only document positions (ignores side, marks, node identity). */
    eqPos(other: EditorSelection) {
        return this.anchor == other.anchor && this.head == other.head
    }

    abstract map(change: ChangeSet, cx: EditorSelection.Context, assoc?: -1 | 1): EditorSelection

    /** Validate type registration and document bounds. */
    check(config: Configuration, doc: Plot.Doc) {
        if (!config.staticFacet(EditorSelection.selectionType).some((t) => this instanceof t.cls))
            throw new RangeError("Unsupported selection type")
        for (let {from, to} of this.ranges)
            if (from < 0 || to > doc.length) throw new RangeError(`Selection out of document range`)
    }

    resolve(doc: Plot.Doc) {
        return EditorSelection.createResolved(doc, this)
    }

    toJSON(state: EditorState): unknown {
        let type = state.facet(EditorSelection.selectionType).find((tp) => this instanceof tp.cls)
        if (!type) throw new Error("Selection type not enabled in state given to EditorSelection.toJSON")
        let result = type.toJSON(this) as any
        result.type = type.tag
        return result
    }
}

export namespace EditorSelection {
    export type Context = {doc: Plot.Doc; config: Configuration}

    // Nested types (runtime values attached by ./selection via Object.assign).
    export type Text = import("./text").Text
    export namespace Text {
        export type Spec = import("./text").Text.Spec
        export type JSON = import("./text").Text.JSON
    }

    export type Node = import("./node").Node
    export namespace Node {
        export type JSON = import("./node").Node.JSON
    }

    export type Resolved = import("./resolved").Resolved
}
