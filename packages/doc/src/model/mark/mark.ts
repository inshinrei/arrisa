import {compareDeep, eqArray, none} from "../../util/utils"
import type {Attributes} from "../../shape/attributes"
import type {Elt} from "../../shape/elt"
import {ElementShape, AttributeShape} from "../../shape/mark-shape"
import type {Shape} from "../../shape/shape"
import {addSet, remove, subtractSet} from "./set"
import type {Node} from "../node/types"
import type {Plot} from "../node/plot"
import type {ParseRule} from "../parse-rule"

/**
 * Inline/structural annotation hung on a node tag (not a separate tree node).
 * Sets are kept sorted by mark rank for stable equality and merge behavior.
 */
export class Mark<Value = unknown> {
    static none: Mark.Set = none

    private constructor(
        readonly type: Mark.Type<Value>,
        readonly value: Value,
    ) {}

    get name() {
        return this.type.name
    }

    get rank() {
        return this.type.rank
    }

    get spanning() {
        return this.type.spanning
    }

    static create<Value>(type: Mark.Type<Value>, value: Value) {
        return new Mark(type, value)
    }

    /** Define a parameter-less (flag) mark and return its default instance. */
    static define(name: string, spec: Mark.Spec<null>): Mark<null> {
        return Mark.Type.define<null>(name, spec, true).default!
    }

    static sameSet(a: Mark.Set, b: Mark.Set): boolean {
        return eqArray(a, b)
    }

    eq(other: Mark) {
        return this.type == other.type && compareDeep(this.value, other.value)
    }

    toString() {
        return this.value == null ? this.name : `${this.name}=${JSON.stringify(this.value)}`
    }

    /**
     * Insert this mark into `set`, replacing same-type marks (or merging set-valued marks).
     * Order follows mark rank / name.
     */
    addToSet(set: Mark.Set): Mark.Set {
        let placed: Mark | null = null,
            copy: Mark[] = []
        for (let i = 0; i < set.length; i++) {
            let other = set[i]
            if (this.eq(other)) return set
            if (other.type != this.type) {
                if (!placed && this.type.compareRank(other.type) < 0) copy.push((placed = this))
                copy.push(other)
            } else if (this.type.set) {
                copy.push(
                    (placed = new Mark(
                        this.type,
                        addSet(other.value as any[], this.value as any[], this.type.set) as any,
                    )),
                )
            } else {
                // Same type, different value: replace in place.
                copy.push((placed = this))
            }
        }
        if (!placed) copy.push(this)
        return copy
    }

    /** Remove this mark (or subtract set values) from `set`. */
    removeFromSet(set: Mark.Set): Mark.Set {
        let type = this.type
        for (let i = 0; i < set.length; i++)
            if (set[i].type == type) {
                let val = set[i],
                    newSet: Mark.Set
                if (type.set) {
                    let rest = subtractSet(val.value as any[], this.value as any[], type.set)
                    if (!rest.length) {
                        newSet = remove(set, i)
                    } else {
                        newSet = set.slice()
                        ;(newSet as Mark[])[i] = new Mark(type, rest as any)
                    }
                } else if (!val.eq(this as any)) {
                    continue
                } else {
                    newSet = remove(set, i)
                }
                return newSet
            }
        return set
    }

    isInSet(set: Mark.Set): Mark<Value> | null {
        for (let v of set) if (v.eq(this)) return v as Mark<Value>
        return null
    }
}

export namespace Mark {
    /**
     * Schema-level mark type: rank, inclusive/spanning policy, and HTML shape
     * (wrapper element or attribute bag).
     */
    export class Type<Param = unknown> {
        readonly rank: number
        readonly set: null | ((a: any, b: any) => number)
        readonly default: Mark<Param> | null
        readonly inclusive: boolean
        readonly element: {name: string; attrs(value: Param): Attributes} | null = null
        readonly attribute: {get(value: Param): Attributes; target: Elt.Selector | null} | null = null
        readonly spanning: boolean

        readonly spec: Mark.Spec<any>

        private constructor(
            readonly name: string,
            spec: Mark.Spec<Param>,
            isFlag: boolean,
        ) {
            this.spec = spec
            this.rank = Math.max(0, Math.min(spec.rank ?? 100, 100))
            this.set = spec.set ? spec.set.compare : null
            this.default =
                isFlag || "defaultParam" in spec ? Mark.create(this, isFlag ? (null as any) : spec.defaultParam!) : null
            this.inclusive = spec.inclusive !== false
            if ("element" in spec.shape) this.element = new ElementShape(spec.shape)
            else this.attribute = new AttributeShape(spec.shape, {hasDefault: !!this.default})
            this.spanning = this.element ? spec.spanning !== false : !!spec.spanning
        }

        get isElement() {
            return !!this.element
        }

        static define<Param>(name: string, spec: Mark.Spec<Param>, isFlag = false) {
            return new Mark.Type<Param>(name, spec, isFlag)
        }

        of(value: Param) {
            return Mark.create(this, value)
        }

        compareRank(other: Mark.Type) {
            return this.rank - other.rank || (other.name < this.name ? 1 : -1)
        }

        removeFromSet(set: Mark.Set): Mark.Set {
            for (let i = 0; i < set.length; i++) if (set[i].type == this) return remove(set, i)
            return set
        }

        isInSet(set: Mark.Set): Mark<Param> | null {
            for (let v of set) if (v.type == this) return v as Mark<Param>
            return null
        }
    }

    export interface Spec<Param> {
        target?: Node.Query
        rank?: number
        inclusive?: boolean
        spanning?: boolean
        keepOnSplit?: boolean | ((tag: Plot.Tag, atEnd: boolean) => boolean)
        keepOnTypeChange?: boolean | ((from: Node.Tag, to: Node.Tag) => boolean)
        defaultParam?: Param
        validate?: string | ((value: Param) => void)
        set?: Param extends ReadonlyArray<infer Content> ? {compare: (a: Content, b: Content) => number} : never
        shape: Shape.Element<Param> | Shape.Attribute<Param> | Shape.Attributes<Param>
        parseRules?: readonly ParseRule.Any[]
    }

    export type Set = readonly Mark[]
}
