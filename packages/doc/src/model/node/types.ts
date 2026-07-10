import type {Mark} from "../mark"
import type {Leaf} from "./leaf"
import type {Plot} from "./plot"
import type {Shape} from "../../shape/shape"
import type {ParseRule} from "../parse-rule"

/**
 * Document tree node: either a {@link Leaf} (terminal) or a {@link Plot} (branch with content).
 *
 * Positions treat every non-text leaf as length 1 and every plot as
 * `2 + contentLength` (open + close tokens around children). Marks hang on the
 * node's tag (`Leaf` itself or `Plot.Tag`), not as separate tree nodes.
 */
export type Node = Plot | Leaf

export namespace Node {
    /** Shared surface of both leaf and plot instances. */
    export interface Shared {
        name: string
        tag: Node.Tag
        length: number
        marks: Mark.Set
        isLeaf: boolean
        isText: boolean
        isPlot: boolean

        mark<Value>(mark: Mark.Type<Value>): Value | undefined

        eq(other: Node): boolean

        withMarks(marks: Mark.Set): Node

        pushTo(nodes: Node[]): void

        toJSON(): Node.JSON
    }

    export type Type<T = any> = Leaf.Type<T> | Plot.Type<T>

    export namespace Type {
        /** Anything that resolves to a node type (type itself or a default tag). */
        export type Ref<T> = Plot.Type<T> | Leaf.Type<T> | Plot.Tag<T> | Leaf<T>

        export function get<T>(ref: Ref<T>): Node.Type<T> {
            // Tags carry `param`; types do not.
            return "param" in (ref as object) ? ((ref as any).type as Node.Type<T>) : (ref as Node.Type<T>)
        }
    }

    export type Tag = Leaf | Plot.Tag

    export namespace Tag {
        export interface Shared<Param> {
            type: Node.Type<Param>
            param: Param
            marks: Mark.Set
            name: string
            isLeaf: boolean
            isPlot: boolean
            isText: boolean

            mark<Value>(mark: Mark.Type<Value>): Value | undefined

            eq(other: Node.Tag): boolean

            is<T>(type: Leaf.Type<T>): this is Leaf<T>

            is<T>(type: Plot.Type<T>): this is Plot.Tag<T>

            toJSON(): Node.JSON
        }

        export type For<Type extends Node.Type.Ref<any>> =
            Type extends Leaf.Type<infer T> ? Leaf<T> : Type extends Plot.Type<infer T> ? Plot.Tag<T> : Type
    }

    /** Shared fields of leaf and plot type specs. */
    export interface Spec<Param> {
        inline?: boolean
        defaultParam?: Param
        validate?: string | ((param: Param) => void)
        group?: Group | readonly Group[]
        role?: Node.Role | readonly Node.Role[]
        shape: Shape.Element<Param> | Shape.Structure<Param>
        parseRules?: readonly ParseRule.Element<Param>[]
    }

    export interface JSON {
        type: string
        param?: any
        marks?: {[name: string]: any}
        content?: readonly Node.JSON[]
    }

    /**
     * Named content/membership groups used by schema queries
     * (`canContain`, mark targets, etc.). Custom groups may parent into builtins.
     */
    export class Group {
        static All = Group.define()
        static Inline = Group.define()
        static Block = Group.define()
        static Leaf = Group.define()
        static Plot = Group.define()
        static Textblock = Group.define()
        static Content = Group.define()
        static TableCell = Group.define()
        static ListItem = Group.define()
        static builtin = [Group.All, Group.Inline, Group.Block, Group.Leaf, Group.Plot, Group.Textblock]
        declare private tag: Node.Group

        private constructor(readonly parent: Group | undefined) {}

        static define(parent?: Group) {
            return new Group(parent)
        }
    }

    /** Content/target query: type, tag, group, OR-list, or AND-object. */
    export type Query = Node.Tag | Node.Type | Group | readonly Node.Query[] | {and: readonly Node.Query[]}

    /** Optional semantic roles (code, list, line-break, …) for commands/serialization. */
    export class Role {
        static Code = Role.define()
        static List = Role.define()
        static LineBreak = Role.define()
        declare private tag: "Node.Role"

        private constructor() {}

        static define() {
            return new Role()
        }
    }
}
