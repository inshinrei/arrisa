import {DomElement, none} from "../util/utils"
import {Reject} from "../util/reject"
import {Elt} from "./elt"
import {Attributes} from "./attributes"

export {Elt} from "./elt"
export {Attributes} from "./attributes"
export {isSafeAttributeName} from "./safe-attr"

/**
 * Shared empty children list for shape builders (same singleton as {@link Elt.empty}).
 */
export const NoChildren = none

/**
 * Spec types for mapping schema nodes and marks to virtual DOM (`Elt`) and optional parse hooks.
 *
 * Runtime construction of node templates is done by {@link NodeShape.from} for
 * {@link Shape.Element} and {@link Shape.Structure}. Mark-oriented
 * {@link Shape.Attribute} / {@link Shape.Attributes} describe attr shapes for later consumers.
 */
export namespace Shape {
    /**
     * Single-tag node shape: emit one element with optional static or param-derived attributes.
     *
     * - **`atom`**: when true, the element has no content hole (`Elt.empty`); when false, it hosts
     *   children via {@link Elt.hole}. Defaults to the schema `leaf` flag in {@link NodeShape.from}.
     * - **`selector` / `readElement`**: parse-side metadata; not used by `NodeShape.from`.
     */
    export type Element<Param> = {
        element: string
        /** CSS-like selector for matching this element when parsing (unused by `from`). */
        selector?: string
        attributes?: Record<string, string> | ((param: Param) => Record<string, string>)
        /** Read node params from a live DOM element; return {@link Reject} to skip (unused by `from`). */
        readElement?: (element: DomElement) => Param | typeof Reject
        atom?: boolean
    }

    /**
     * Full-template node shape: an {@link Elt} tree (static or built from `param`).
     *
     * For a **static** template, `atom` must agree with `!structure.hasContent` (or is inferred from it).
     * For a **dynamic** template, `atom` must be set explicitly unless the node is a leaf (then forced true).
     */
    export type Structure<Param> = {
        structure: Elt<string> | ((param: Param) => Elt<string>)
        atom?: boolean
    }

    /**
     * Mark shape that maps to a single HTML attribute.
     * When `Param` is `string`, `value` may be `0` meaning “use the param as the attribute value”.
     * `preferTarget` selects a descendant selector for applying the mark (parse/render consumers).
     */
    export type Attribute<Param> = {
        attribute: string
        value: (Param extends string ? 0 : never) | string | ((param: Param) => string | null)
        readAttribute?: (value: string) => Param | typeof Reject
        preferTarget?: string
    }

    /**
     * Mark shape that maps to a bag of HTML attributes (static or param-derived).
     * `preferTarget` is the same descendant selector idea as on {@link Shape.Attribute}.
     */
    export type Attributes<Param> = {
        attributes: Record<string, string> | ((param: Param) => Record<string, string>)
        preferTarget?: string
    }
}

/**
 * Resolved node shape: whether the node is atomic (no fillable content hole) and a
 * `create(param)` function that builds the virtual element tree for serialization.
 *
 * Construct only via {@link NodeShape.from}.
 */
/**
 * Resolved node shape template. `Param` defaults to `any` so concrete leaf/plot
 * types remain assignable under schema maps keyed by `Node.Type`.
 */
export class NodeShape<Param = any> {
    private constructor(
        readonly atom: boolean,
        readonly create: (param: Param) => Elt<string>,
    ) {}

    /**
     * Build a {@link NodeShape} from an element or structure spec.
     *
     * @param name Schema tag name — used only in error messages.
     * @param leaf Whether the schema node is a leaf (must be atomic).
     * @param spec Element (tag + attrs) or structure (`Elt` template) description.
     *
     * **Element defaults / rules**
     * - `atom` defaults to `leaf`.
     * - Static `attributes` share one `Elt` across `create` calls; function attrs rebuild each time.
     * - Atom → {@link Elt.empty} children; non-atom → {@link Elt.hole}.
     * - Non-atomic leaf throws.
     *
     * **Structure defaults / rules**
     * - Leaf forces `atom = true`.
     * - Dynamic `structure` requires an explicit `atom` (unless leaf already forced it).
     * - Static `structure`: `atom` defaults to `!structure.hasContent`, or must match if set.
     */
    static from<Param>(name: string, leaf: boolean, spec: Shape.Element<Param> | Shape.Structure<Param>) {
        let atom = spec.atom,
            create: (param: Param) => Elt<string>
        if ("element" in spec) {
            if (atom == null) atom = leaf
            let {element, attributes} = spec
            if (typeof attributes == "function") {
                create = (param: Param) =>
                    Elt.create(element, Attributes.read(attributes(param)), atom ? Elt.empty : Elt.hole)
            } else {
                let elt = Elt.create(
                    element,
                    attributes ? Attributes.read(attributes) : Attributes.none,
                    atom ? Elt.empty : Elt.hole,
                )
                create = () => elt
            }
        } else {
            if (leaf) atom = true
            let {structure} = spec
            if (typeof structure == "function") {
                if (atom == null) throw new Error(`Dynamic structure for tag ${name} must define an \`atom\` field`)
                create = structure
            } else {
                if (atom == null) atom = !structure.hasContent
                else if (atom != !structure.hasContent)
                    throw new Error(`Disagreement between \`atom\` field and structure for tag ${name}`)
                create = () => structure
            }
        }
        if (!atom && leaf) throw new Error(`Leaf tag ${name}'s shape must be atomic`)
        return new NodeShape<Param>(atom, create)
    }
}
