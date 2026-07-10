import type {Mark} from "./mark"
import type {Node} from "./node/types"
import type {Leaf} from "./node/leaf"
import type {Plot} from "./node/plot"
import type {Reject} from "../util/reject"

/**
 * Declarative HTML parse rules attached to node/mark specs.
 * Consumed by {@link parse} when building a rule set from a schema.
 *
 * Lives under `model` so node/mark specs do not import `html`.
 */
export namespace ParseRule {
    export type Any = Element<any> | Attribute<any>

    export interface Element<Param = any> {
        selector: string
        tag?: Leaf<Param> | Plot.Tag<Param> | Node.Type<Param>
        mark?: Mark.Type<Param> | Mark<Param>
        ignore?: boolean | "skip"
        param?: Param
        readElement?: (element: globalThis.Element) => Param | typeof Reject
        marksFrom?: string
        contentElement?: string | ((elt: globalThis.Element) => globalThis.Element)
        ignoreContent?: string | ((elt: globalThis.Element) => boolean)
        precedence?: number
    }

    export interface Attribute<Param = any> {
        attribute: string
        value?: string
        mark?: Mark.Type<Param> | Mark<Param>
        clearMark?: (mark: Mark<unknown>) => boolean
        ignore?: boolean
        param?: Param
        readAttribute?: (value: string) => Param | typeof Reject
        consuming?: boolean
        precedence?: number
    }
}
