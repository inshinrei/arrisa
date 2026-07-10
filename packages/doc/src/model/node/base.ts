import {Mark} from "../mark"
import {NodeFlag} from "./flags"
import {Node} from "./types"
import type {Leaf} from "./leaf"
import type {Plot} from "./plot"
import type {NodeShape} from "../../shape/shape"

/**
 * Shared runtime base for {@link Leaf.Type} and {@link Plot.Type}:
 * name, flags, roles, and resolved {@link NodeShape}.
 */
export abstract class BaseType<Param> {
    readonly roles: Set<Node.Role> = new Set()
    readonly flags: NodeFlag
    abstract isLeaf: boolean
    abstract isPlot: boolean

    constructor(
        readonly name: string,
        flags: NodeFlag,
        spec: Node.Spec<Param>,
        readonly shape: NodeShape<Param>,
    ) {
        if (spec.role instanceof Node.Role) this.roles.add(spec.role)
        else if (spec.role) for (let role of spec.role) this.roles.add(role)
        this.flags = shape.atom ? flags | NodeFlag.Atom : flags
    }

    get isInline() {
        return (this.flags & NodeFlag.Inline) > 0
    }

    get isBlock() {
        return (this.flags & NodeFlag.Inline) == 0
    }

    get isAtom() {
        return (this.flags & NodeFlag.Atom) > 0
    }

    hasRole(role: Node.Role) {
        return this.roles.has(role)
    }
}

/**
 * Shared base for concrete tags: a typed `param` plus a mark set.
 * Leaves are their own tag; plots use {@link Plot.Tag}.
 */
export abstract class BaseTag<Param> {
    abstract type: Node.Type<Param>
    abstract isLeaf: boolean
    abstract isPlot: boolean

    constructor(
        readonly param: Param,
        readonly marks: Mark.Set,
    ) {}

    get name() {
        return this.type.name
    }

    get isText(): boolean {
        return this.isLeaf && this.type.name == "Text"
    }

    mark<Value>(mark: Mark.Type<Value>): Value | undefined {
        for (let v of this.marks) if (v.type == mark) return v.value as Value
        return undefined
    }

    abstract eq(other: Node | Node.Tag): boolean

    is<T>(type: Leaf.Type<T>): this is Leaf<T>
    is<T>(type: Plot.Type<T>): this is Plot.Tag<T>
    is(type: any) {
        return this.type == type
    }

    toJSON(): Node.JSON {
        let result: Node.JSON = {type: this.name}
        if (this != (this.type.default as any)) result.param = this.param
        if (this.marks.length) {
            result.marks = Object.create(null)
            for (let {name, value} of this.marks) result.marks![name] = value
        }
        return result
    }
}
