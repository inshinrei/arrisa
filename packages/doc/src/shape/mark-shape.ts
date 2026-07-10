import {Elt} from "./elt"
import {Attributes} from "./attributes"
import type {Shape} from "./shape"
import {SchemaError} from "../util/error"

/**
 * Resolved mark shape that emits a single HTML element (wrapper-style marks).
 * Built from {@link Shape.Element} at mark-type definition time.
 */
export class ElementShape<Param> {
    readonly name: string
    readonly attrs: (value: Param) => Attributes

    constructor(spec: Shape.Element<Param>) {
        this.name = spec.element
        let {attributes} = spec
        if (typeof attributes == "function") {
            this.attrs = (value: Param) => Attributes.read(attributes(value))
        } else {
            let attrs = attributes ? Attributes.read(attributes) : Attributes.none
            this.attrs = () => attrs
        }
    }
}

/**
 * Options that avoid importing `Mark.Type` (breaks mark ↔ shape cycles).
 * `hasDefault` is true when the mark type has a default/flag value.
 */
export type AttributeShapeOptions = {
    hasDefault: boolean
}

/**
 * Resolved mark shape that maps to one or more HTML attributes.
 * Built from {@link Shape.Attribute} or {@link Shape.Attributes}.
 */
export class AttributeShape<Param> {
    readonly get: (param: Param) => Attributes
    readonly target: Elt.Selector | null

    constructor(
        spec: Shape.Attribute<Param> | Shape.Attributes<Param>,
        options: AttributeShapeOptions,
    ) {
        if ("attribute" in spec) {
            let {value, attribute} = spec
            if (value === 0) {
                if (options.hasDefault)
                    throw new SchemaError("Attribute shapes for parameter-less marks cannot use 0 as value")
                this.get = (param) => Attributes.read({[attribute]: String(param)})
            } else if (typeof value == "function") {
                this.get = (param) => {
                    let val = value(param)
                    return val == null ? Attributes.none : Attributes.read({[attribute]: val})
                }
            } else {
                let attrs = Attributes.read({[attribute]: value})
                this.get = () => attrs
            }
        } else {
            let {attributes} = spec
            if (typeof attributes == "function") {
                this.get = (param) => Attributes.read(attributes(param))
            } else {
                let attrs = Attributes.read(attributes)
                this.get = () => attrs
            }
        }
        this.target = spec.preferTarget ? Elt.Selector.parse(spec.preferTarget) : null
    }
}
