import {compareDeep, eqArray, none} from "../../util/utils"
import {SchemaError} from "../../util/error"
import {BaseTag, BaseType} from "./base"
import {NodeFlag} from "./flags"
import {NodeShape} from "../../shape/shape"
import {Mark} from "../mark"
import {Node} from "./types"
import {Leaf} from "./leaf"
import {flagsFor, joinText, markString, sliceContent} from "./utils"
import {TextOutput} from "./text"
import {Slice} from "../slice"
import {Token} from "../token"
import type {Schema} from "../../schema/schema"
import type {Token as TokenUnion} from "../slice"
import {Pos} from "../pos"

// Plot.End aliases Token.End (close-plot sentinel in slices / changes).

/**
 * Branch document node with a tag and ordered children.
 * Length is `2 + sum(child.length)` (open/close around content), except for {@link Plot.Doc}.
 */
export class Plot implements Node.Shared {
    readonly contentLength: number

    protected constructor(
        readonly tag: Plot.Tag,
        readonly content: readonly Node[],
    ) {
        this.contentLength = content.reduce((s, c) => s + c.length, 0)
    }

    get name() {
        return this.tag.name
    }

    get type() {
        return this.tag.type
    }

    get marks() {
        return this.tag.marks
    }

    get length() {
        return 2 + this.contentLength
    }

    get isText(): false {
        return false
    }

    get inlineContent() {
        return this.type.inlineContent
    }

    get isTextblock() {
        return this.type.isTextblock
    }

    get isLeaf(): false {
        return false
    }

    get isPlot(): true {
        return true
    }

    get isDoc() {
        return this.type.isDoc
    }

    get firstChild(): Node | null {
        return this.content.length ? this.content[0] : null
    }

    get lastChild(): Node | null {
        let last = this.content.length - 1
        return last < 0 ? null : this.content[last]
    }

    get tokenType(): Token.Type.Node {
        return Token.Type.Node
    }

    static create(tag: Plot.Tag, content: readonly Node[]) {
        return new Plot(tag, content)
    }

    static define(name: string, spec: Plot.Spec<null>): Plot.Tag<null> {
        return Plot.Type.new<null>(name, flagsFor(spec) | NodeFlag.NullParam, spec).default!
    }

    static defineDoc(spec: {inlineContent?: Node.Query | true; blockContent?: Node.Query; canBeEmpty?: boolean}) {
        if (!spec.inlineContent && !spec.blockContent) throw new SchemaError("Doc nodes must allow content")
        let flags = NodeFlag.NullParam | NodeFlag.Doc
        if (spec.inlineContent) flags |= NodeFlag.InlineContent
        if (spec.inlineContent || spec.canBeEmpty) flags |= NodeFlag.CanBeEmpty
        return Plot.Type.new<null>("Doc", flags, {
            ...spec,
            shape: {element: ""},
        })
    }

    eq(other: Node): boolean {
        return (
            this == other || (other instanceof Plot && this.tag.eq(other.tag) && eqArray(this.content, other.content))
        )
    }

    sliceInner(from: number, to: number) {
        if (from == to) return Slice.empty
        let content: TokenUnion[] = []
        this.slicePlot(content, from, to)
        return Slice.of(content)
    }

    slicePlot(out: TokenUnion[], from: number, to: number) {
        if (from <= 0) {
            if (to >= this.length) {
                out.push(this)
                return
            }
            out.push(this.tag)
        }
        sliceContent(out, this.content, from - 1, to - 1)
        if (to >= this.length) out.push(Plot.End)
    }

    is<T>(_type: Leaf.Type<T>): false {
        return false
    }

    iterate(
        from: number,
        to: number,
        f: (node: Node, pos: number, parent: Plot | null, index: number) => boolean | void,
    ): void

    iterate(f: (node: Node, pos: number, parent: Plot | null, index: number) => boolean | void): void

    iterate(
        a: number | ((node: Node, pos: number, parent: Plot | null, index: number) => boolean | void),
        b?: number,
        c?: (node: Node, pos: number, parent: Plot | null, index: number) => boolean | void,
    ): void {
        let [from, to, f] = typeof a == "number" ? [a, b!, c!] : [0, this.length, a]
        if (this.isDoc || f(this, 0, null, 0) !== false) this.iterInner(0, from, to, f)
    }

    nodeAt(pos: number): Node | null {
        for (let node of this.content) {
            if (pos == 0) return node.isText ? null : node
            if (pos < node.length) return node.isLeaf ? null : node.nodeAt(pos - 1)
            pos -= node.length
        }
        return null
    }

    plotAt(pos: number): Plot | null {
        let node = this.nodeAt(pos)
        return node instanceof Plot ? node : null
    }

    textContent(
        options: {
            from?: number
            to?: number
            blockSeparator?: string
            leafText?: string | ((node: Leaf) => string)
        } = {},
    ) {
        let {from = 0, to = this.length, blockSeparator = "\n", leafText} = options
        let out = new TextOutput(
            blockSeparator,
            leafText == null ? undefined : typeof leafText == "string" ? () => leafText : leafText,
        )
        this.iterate(from, to, (node, pos) => {
            return !out.serialize(
                node.is(Leaf.Text) ? node.sliceText(Math.max(0, from - pos), Math.min(node.length, to - pos)) : node,
            )
        })
        return out.text
    }

    iterInner(
        contentStart: number,
        from: number,
        to: number,
        f: (node: Node, pos: number, parent: Plot | null, index: number) => boolean | void,
    ) {
        for (let pos = contentStart, i = 0; i < this.content.length; i++) {
            if (pos >= to) break
            let node = this.content[i],
                start = pos
            pos += node.length
            if (pos <= from) continue
            if (f(node, start, this, i) !== false && node.isPlot) node.iterInner(start + 1, from, to, f)
        }
    }

    toString() {
        return this.name + markString(this.tag.marks) + "(" + this.content.join() + ")"
    }

    toJSON(): Node.JSON {
        let result = this.tag.toJSON()
        result.content = this.content.map((c) => c.toJSON())
        return result
    }

    mark<Value>(mark: Mark.Type<Value>): Value | undefined {
        return this.tag.mark(mark)
    }

    pushTo(nodes: Node[]) {
        nodes.push(this)
    }

    withMarks(marks: Mark.Set) {
        return Mark.sameSet(this.tag.marks, marks) ? this : this.tag.withMarks(marks).create(this.content)
    }
}

export namespace Plot {
    export const End = Token.End

    /** Open-token identity of a plot: type + param + marks (no children). */
    export class Tag<Param = any> extends BaseTag<Param> implements Node.Tag.Shared<Param> {
        private constructor(
            readonly type: Plot.Type<Param>,
            param: Param,
            marks: Mark.Set,
        ) {
            super(param, marks)
        }

        get tokenType(): Token.Type.Open {
            return Token.Type.Open
        }

        get inlineContent() {
            return this.type.inlineContent
        }

        get isTextblock() {
            return this.type.isTextblock
        }

        get isLeaf(): false {
            return false
        }

        get isPlot(): true {
            return true
        }

        get isDoc() {
            return this.type.isDoc
        }

        static new<Param>(type: Plot.Type<Param>, param: Param, marks: Mark.Set) {
            return new Tag(type, param, marks)
        }

        eq(other: Node | Node.Tag): boolean {
            return (
                this == other ||
                (other instanceof Plot.Tag &&
                    this.type == other.type &&
                    compareDeep(this.param, other.param) &&
                    Mark.sameSet(this.marks, other.marks))
            )
        }

        create(content?: readonly Node[]): Plot {
            if (this.isDoc) throw new Error("Document nodes must be created with schema.doc()")
            return Plot.create(this, content ? joinText(content) : none)
        }

        withMarks(marks: Mark.Set) {
            return Mark.sameSet(this.marks, marks) ? this : this.type.of(this.param, marks)
        }

        /** Drop marks that do not keep on split at this edge. */
        split(atEnd: boolean): Tag<Param> {
            return this.marks.length
                ? this.withMarks(
                      this.marks.filter((p) => {
                          let {keepOnSplit} = p.type.spec
                          return keepOnSplit && (keepOnSplit === true || keepOnSplit(this, atEnd))
                      }),
                  )
                : this
        }

        toString() {
            return this.type.name + markString(this.marks)
        }
    }

    export class Type<Param = any> extends BaseType<Param> {
        readonly default: Plot.Tag<Param> | null
        readonly isolating: boolean
        readonly defining: boolean
        readonly neutral: boolean
        readonly preserveWhitespace: boolean
        readonly orientation: "row" | "column"

        readonly spec: Plot.Spec<any>

        private constructor(name: string, flags: NodeFlag, spec: Plot.Spec<Param>) {
            super(name, flags, spec, NodeShape.from(name, false, spec.shape))
            this.spec = spec
            if (!spec.inlineContent && !spec.blockContent)
                throw new SchemaError("Plot definitions must specify either inlineContent or blockContent")
            this.isolating = !!spec.isolating
            this.defining = !!spec.defining
            this.neutral = spec.neutral ?? !this.defining
            this.preserveWhitespace = spec.preserveWhitespace ?? !!this.hasRole(Node.Role.Code)
            this.orientation = flags & NodeFlag.InlineContent ? "row" : spec.orientation || "column"
            this.default =
                "defaultParam" in spec
                    ? Plot.Tag.new(this, spec.defaultParam!, none)
                    : flags & NodeFlag.NullParam
                      ? Plot.Tag.new(this, null as any, none)
                      : null
            if (!this.shape.atom && this.isInline && !this.inlineContent)
                throw new SchemaError("Inline tags with block content must be marked as atoms")
        }

        get inlineContent() {
            return (this.flags & NodeFlag.InlineContent) > 0
        }

        get isTextblock() {
            return this.isBlock && this.inlineContent
        }

        get isDoc() {
            return (this.flags & NodeFlag.Doc) > 0
        }

        get isLeaf(): false {
            return false
        }

        get isPlot(): true {
            return true
        }

        get canBeEmpty() {
            return (this.flags & NodeFlag.CanBeEmpty) > 0
        }

        static new<Param>(name: string, flags: NodeFlag, spec: Plot.Spec<Param>) {
            return new Type(name, flags, spec)
        }

        static define<T>(name: string, spec: Plot.Spec<T>) {
            return new Plot.Type<T>(name, flagsFor(spec), spec)
        }

        of(param: Param, marks: Mark.Set = Mark.none) {
            if (!marks.length && this.default && compareDeep(this.default.param, param)) return this.default
            return Plot.Tag.new(this, param, marks)
        }
    }

    export interface Spec<Param> extends Node.Spec<Param> {
        blockContent?: Node.Query
        inlineContent?: Node.Query | true
        canBeEmpty?: boolean
        cursorBarrier?: boolean
        defaultBlock?: boolean
        preserveWhitespace?: boolean
        isolating?: boolean
        orientation?: "row" | "column"
        defining?: boolean
        neutral?: boolean
        autoJoin?: boolean | ((before: Plot.Tag, after: Plot.Tag) => boolean)
        preserveOnSplitAtEnd?: boolean
        cursorInsideBounds?: boolean
    }

    let validateDocs = true

    /**
     * Top-level document plot bound to a {@link Schema}.
     * Length is content-only (no outer open/close). Created via `schema.doc()`.
     */
    export class Doc extends Plot {
        private constructor(
            readonly schema: Schema,
            children: readonly Node[],
        ) {
            super(schema.docTag, children)
            if (validateDocs) schema.validate(this)
        }

        get length() {
            return this.contentLength
        }

        static new(schema: Schema, children: readonly Node[]) {
            return new Doc(schema, children)
        }

        /** Run `f` without validating docs constructed inside. */
        static noValidate<T>(f: () => T): T {
            let prev = validateDocs
            validateDocs = false
            try {
                return f()
            } finally {
                validateDocs = prev
            }
        }

        slicePlot(content: TokenUnion[], from: number, to: number) {
            sliceContent(content, this.content, from, to)
        }

        resolve(pos: number) {
            return Pos.resolve(this, pos)
        }

        resolveNode(pos: number) {
            return Pos.resolveNode(this, pos)
        }

        resolvePlot(pos: number) {
            let r = this.resolveNode(pos)
            return r instanceof Pos.Plot ? r : null
        }

        contextAt(pos: number, maxDepth?: number): readonly Plot.Tag[] {
            for (let {parent} = this.resolve(pos), context: Plot.Tag[] = []; ;) {
                if (!parent.parent || (maxDepth != null && context.length == maxDepth)) return context
                context.push(parent.node.tag)
                parent = parent.parent
            }
        }

        slice(from: number, to = this.length) {
            return this.sliceInner(from, to)
        }
    }
}
