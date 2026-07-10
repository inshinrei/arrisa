import {compareDeep, none} from "../../util/utils"
import {BaseTag, BaseType} from "./base"
import {NodeFlag} from "./flags"
import {NodeShape} from "../../shape/shape"
import {Mark} from "../mark"
import {Node} from "./types"
import {flagsFor, markString} from "./utils"
import {Slice} from "../slice"
import {Token} from "../token"

/**
 * Terminal document node (text or atom). A leaf is both a node instance and its own tag.
 * Text leaves use `param: string` and contribute `param.length` to document positions.
 */
export class Leaf<Param = any> extends BaseTag<Param> implements Node.Shared, Node.Tag.Shared<Param> {
    private constructor(
        readonly type: Leaf.Type<Param>,
        param: Param,
        marks: Mark.Set,
    ) {
        super(param, marks)
    }

    get tag() {
        return this
    }

    get tokenType(): Token.Type.Node {
        return Token.Type.Node
    }

    get isLeaf(): true {
        return true
    }

    get isPlot(): false {
        return false
    }

    get length(): number {
        return this.is(Leaf.Text) ? (this.param as string).length : 1
    }

    static new<Param>(type: Leaf.Type<Param>, param: Param, marks: Mark.Set) {
        return new Leaf(type, param, marks)
    }

    static define(name: string, spec: Leaf.Spec<null>): Leaf<null> {
        return Leaf.Type.new<null>(name, flagsFor(spec) | NodeFlag.NullParam, spec).default!
    }

    static text(text: string, marks: Mark.Set = Mark.none) {
        return Leaf.Text.of(text, marks)
    }

    eq(other: Node | Node.Tag): boolean {
        return (
            this == other ||
            (other.isLeaf &&
                this.type == other.type &&
                compareDeep(this.param, other.param) &&
                Mark.sameSet(this.marks, other.marks))
        )
    }

    withMarks(marks: Mark.Set) {
        return Mark.sameSet(this.marks, marks) ? this : this.type.of(this.param, marks)
    }

    pushTo(nodes: Node[]) {
        if (this.is(Leaf.Text)) {
            let prevI = nodes.length - 1,
                prev = prevI >= 0 ? nodes[prevI] : null
            if (prev && prev.is(Leaf.Text) && Mark.sameSet(prev.marks, this.marks)) {
                nodes[prevI] = Leaf.text(prev.param + this.param, this.marks)
                return
            }
        }
        nodes.push(this)
    }

    sliceInner(from: number, to: number) {
        return from == to ? Slice.empty : Slice.of([this.is(Leaf.Text) ? this.sliceText(from, to) : this])
    }

    sliceText(from: number, to?: number): Leaf<string> {
        if (!this.is(Leaf.Text)) throw new Error("Calling sliceText on a non-text node")
        if (to == null) to = (this.param as string).length
        if (!from && to == (this.param as string).length) return this as Leaf<string>
        return Leaf.Text.of((this.param as string).slice(Math.max(from, 0), Math.max(0, to)), this.marks)
    }

    toString() {
        return (this.is(Leaf.Text) ? JSON.stringify(this.param) : (this as Leaf).name) + markString(this.marks)
    }
}

export namespace Leaf {
    export class Type<Param = any> extends BaseType<Param> {
        readonly default: Leaf<Param> | null

        readonly spec: Leaf.Spec<any>

        private constructor(name: string, flags: NodeFlag, spec: Leaf.Spec<Param>) {
            super(name, flags, spec, NodeShape.from(name, true, spec.shape))
            this.spec = spec
            this.default =
                "defaultParam" in spec
                    ? Leaf.new(this, spec.defaultParam!, none)
                    : flags & NodeFlag.NullParam
                      ? Leaf.new(this, null as any, none)
                      : null
        }

        get isLeaf(): true {
            return true
        }

        get isPlot(): false {
            return false
        }

        get isSelectable() {
            return (this.flags & NodeFlag.Selectable) > 0
        }

        static new<Param>(name: string, flags: NodeFlag, spec: Leaf.Spec<Param>) {
            return new Type(name, flags, spec)
        }

        static define<T>(name: string, spec: Leaf.Spec<T>) {
            return new Leaf.Type<T>(name, flagsFor(spec), spec)
        }

        of(param: Param, marks: Mark.Set = Mark.none) {
            if (!marks.length && this.default && compareDeep(this.default.param, param)) return this.default
            return Leaf.new(this, param, marks)
        }
    }

    export interface Spec<Param> extends Node.Spec<Param> {
        toText?: (node: Leaf) => string
        selectable?: boolean
    }

    /** Built-in text leaf type (always present in every schema). */
    export const Text: Leaf.Type<string> = Leaf.Type.new<string>("Text", NodeFlag.Inline, {
        shape: {element: ""},
    })
}
