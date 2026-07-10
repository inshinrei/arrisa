/**
 * Resolved extension configuration: fields, facets, compartments, and the
 * address table that maps ids → slot storage.
 *
 * **Address encoding** (same as `slot.ts`):
 * - even (`addr & 1 == 0`) → dynamic slot at `values[addr >> 1]`
 * - odd (`addr & 1 == 1`) → static value at `staticValues[addr >> 1]`
 *
 * Precedence wrappers (`prec.*`) and {@link Compartment}s are flattened into
 * ordered provider lists before addresses are assigned.
 */
import {Plot, Schema} from "@arrisa/doc"
import type {EditorState} from "./state"
import type {Extension} from "./extension"
import {Field} from "./field"
import {Facet} from "./facet"
import {
    type DynamicSlot,
    FacetProvider,
    ProviderFlag,
    SlotStatus,
    dynamicFacetSlot,
} from "./slot"
import {none, sameArray} from "./ids"
import {schemaElement, textLTR, textblockLTR, visualCursorMotion} from "./facets"
import {Effect} from "../transaction/effect"

/** Lower numeric value = higher precedence when flattening. */
const enum Prec {
    Lowest = 4,
    Low = 3,
    Default = 2,
    High = 1,
    Highest = 0,
}

class PrecExtension {
    extension!: Extension

    constructor(
        readonly inner: Extension,
        readonly prec: number,
    ) {}
}

function mkPrec(value: number) {
    return (ext: Extension) => new PrecExtension(ext, value) as Extension
}

/** Wrap extensions at a given precedence band. */
export const prec = {
    highest: mkPrec(Prec.Highest),
    high: mkPrec(Prec.High),
    default: mkPrec(Prec.Default),
    low: mkPrec(Prec.Low),
    lowest: mkPrec(Prec.Lowest),
}

export class CompartmentInstance {
    extension!: Extension

    constructor(
        readonly compartment: Compartment,
        readonly inner: Extension,
    ) {}
}

/**
 * A replaceable slot in the extension tree. Use {@link of} in the base config
 * and {@link reconfigure} effects to swap content without rebuilding everything.
 */
export class Compartment {
    static reconfigureCompartment = Effect.define<{
        compartment: Compartment
        extension: Extension
    }>()

    private constructor() {}

    static define() {
        return new Compartment()
    }

    of(ext: Extension): Extension {
        return new CompartmentInstance(this, ext)
    }

    reconfigure(content: Extension): Effect<unknown> {
        return Compartment.reconfigureCompartment.of({compartment: this, extension: content})
    }

    get(state: EditorState): Extension | undefined {
        return state.config.compartments.get(this)
    }
}

export class Configuration {
    readonly statusTemplate: SlotStatus[] = []

    private constructor(
        readonly base: Extension,
        readonly compartments: Map<Compartment, Extension>,
        readonly dynamicSlots: DynamicSlot[],
        readonly address: {[id: number]: number},
        readonly staticValues: readonly any[],
        readonly facets: {[id: number]: readonly FacetProvider<any>[]},
    ) {
        while (this.statusTemplate.length < dynamicSlots.length) this.statusTemplate.push(SlotStatus.Unresolved)
    }

    get schema(): Schema | null {
        let elts = this.staticFacet(schemaElement)
        if (!elts.some((elt) => elt instanceof Plot.Type && elt.isDoc)) return null
        return Schema.define(elts)
    }

    get textLTR() {
        return this.staticFacet(textLTR)
    }

    get visualCursorMotion() {
        return this.staticFacet(visualCursorMotion)
    }

    /**
     * Flatten extensions, assign addresses, and build dynamic slot factories.
     * When `oldState` is provided, static facet values may be reused if equal.
     */
    static resolve(
        base: Extension,
        compartments: Map<Compartment, Extension>,
        oldState?: EditorState,
    ) {
        let fields: Field<any>[] = []
        let facets: {[id: number]: FacetProvider<any>[]} = Object.create(null)
        let newCompartments = new Map<Compartment, Extension>()

        for (let ext of flatten(base, compartments, newCompartments)) {
            if (ext instanceof FacetProvider) (facets[ext.facet.id] || (facets[ext.facet.id] = [])).push(ext)
            else fields.push(ext)
        }

        let address: {[id: number]: number} = Object.create(null)
        let staticValues: any[] = []
        let dynamicSlots: ((address: {[id: number]: number}) => DynamicSlot)[] = []

        for (let field of fields) {
            address[field.id] = dynamicSlots.length << 1
            dynamicSlots.push((a) => field.slot(a))
        }

        let oldFacets = oldState?.config.facets
        for (let id in facets) {
            let providers = facets[id],
                facet = providers[0].facet
            let oldProviders = (oldFacets && oldFacets[id]) || none
            if (providers.every((p) => p.flags & ProviderFlag.Static)) {
                address[facet.id] = (staticValues.length << 1) | 1
                if (sameArray(oldProviders, providers)) {
                    staticValues.push(oldState!.facet(facet))
                } else {
                    let value = facet.combine(providers.map((p) => p.value))
                    staticValues.push(
                        oldState && facet.compare(value, oldState.facet(facet)) ? oldState.facet(facet) : value,
                    )
                }
            } else {
                for (let p of providers) {
                    if (p.flags & ProviderFlag.Static) {
                        address[p.id] = (staticValues.length << 1) | 1
                        staticValues.push(p.value)
                    } else {
                        address[p.id] = dynamicSlots.length << 1
                        dynamicSlots.push((a) => p.dynamicSlot(a))
                    }
                }
                address[facet.id] = dynamicSlots.length << 1
                dynamicSlots.push((a) => dynamicFacetSlot(a, facet, providers))
            }
        }

        let dynamic = dynamicSlots.map((f) => f(address))
        return new Configuration(base, newCompartments, dynamic, address, staticValues, facets)
    }

    static create(extensions: Extension) {
        return Configuration.resolve(extensions, new Map())
    }

    staticFacet<Output>(facet: Facet<any, Output>): Output {
        if (!facet.isStatic) throw new Error("Only static facets can be accessed from a configuration")
        let addr = this.address[facet.id]
        return addr == null ? facet.default : this.staticValues[addr >> 1]
    }

    /** First non-null `textblockLTR` provider, else base {@link textLTR}. */
    textblockLTR(plot: Plot) {
        for (let f of this.staticFacet(textblockLTR)) {
            let result = f(plot)
            if (result != null) return result
        }
        return this.textLTR
    }
}

/**
 * Depth-first flatten of the extension tree into precedence buckets, then
 * concatenate high→low. Detects duplicate compartments.
 */
function flatten(
    extension: Extension,
    compartments: Map<Compartment, Extension>,
    newCompartments: Map<Compartment, Extension>,
) {
    let result: (FacetProvider<any> | Field<any>)[][] = [[], [], [], [], []]
    let seen = new Map<Extension, number>()
    function inner(ext: Extension, precLevel: number) {
        let known = seen.get(ext)
        if (known != null) {
            if (known <= precLevel) return
            let found = result[known].indexOf(ext as any)
            if (found > -1) result[known].splice(found, 1)
            if (ext instanceof CompartmentInstance) newCompartments.delete(ext.compartment)
        }
        seen.set(ext, precLevel)
        if (Array.isArray(ext)) {
            for (let e of ext) inner(e, precLevel)
        } else if (ext instanceof CompartmentInstance) {
            if (newCompartments.has(ext.compartment))
                throw new RangeError(`Duplicate use of compartment in extensions`)
            let content = compartments.get(ext.compartment) || ext.inner
            newCompartments.set(ext.compartment, content)
            inner(content, precLevel)
        } else if (ext instanceof PrecExtension) {
            inner(ext.inner, ext.prec)
        } else if (ext instanceof Field) {
            result[precLevel].push(ext)
            if (ext.provides) inner(ext.provides, precLevel)
        } else if (ext instanceof FacetProvider) {
            result[precLevel].push(ext)
            if (ext.facet.extensions) inner(ext.facet.extensions, Prec.Default)
        } else {
            let content = (ext as any).extension
            if (!content)
                throw new Error(
                    `Unrecognized extension value in extension set (${ext}). This sometimes happens because multiple instances of editor are loaded, breaking instanceof checks.`,
                )
            inner(content, precLevel)
        }
    }
    inner(extension, Prec.Default)
    return result.reduce((a, b) => a.concat(b))
}
