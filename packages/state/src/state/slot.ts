/**
 * Dynamic slot machinery for fields and facets.
 *
 * Each dynamic value has a status word ({@link SlotStatus}) and a
 * {@link DynamicSlot} with create / update / reconfigure. Addresses:
 * - even → `state.values[addr >> 1]`
 * - odd → `state.config.staticValues[addr >> 1]`
 *
 * Auto facet providers start with an empty dependency list that grows as
 * {@link EditorState.recordAccess} observes `doc` / `selection` / fields.
 */
import type {EditorState} from "./state"
import type {Transaction} from "../transaction"
import {Field} from "./field"
import {Facet} from "./facet"
import type {Extension} from "./extension"
import {allocID, sameArray} from "./ids"

export const enum SlotStatus {
    Unresolved = 0,
    Changed = 1,
    Computed = 2,
    Computing = 4,
}

export const enum ProviderFlag {
    Static = 1,
    Multi = 2,
    Auto = 4,
}

export type Slot = Facet.Reader<any> | Field<any> | "doc" | "selection" | "schema"

export interface DynamicSlot {
    create(state: EditorState): SlotStatus
    update(state: EditorState, tr: Transaction): SlotStatus
    reconfigure(state: EditorState, oldState: EditorState): SlotStatus
}

/** Incrementally collected dependency flags for a facet provider. */
export class DependencySet {
    doc: boolean = false
    sel: boolean = false
    schema: boolean = false
    addrs: number[] = []
    count: number = 0

    update(deps: readonly Slot[], addresses: {[id: number]: number}) {
        while (this.count < deps.length) {
            let dep = deps[this.count++]
            if (dep === "doc") this.doc = true
            else if (dep === "selection") this.sel = true
            else if (dep === "schema") this.schema = true
            else if (((addresses[dep.id] ?? 1) & 1) == 0) this.addrs.push(addresses[dep.id])
        }
    }
}

/** One provider contribution to a facet (static value or compute function). */
export class FacetProvider<Input> {
    readonly id = allocID()
    extension!: Extension
    dependencies: Slot[]

    constructor(
        dependencies: readonly Slot[],
        readonly facet: Facet<Input, any>,
        readonly flags: ProviderFlag,
        readonly value: ((state: EditorState) => Input) | ((state: EditorState) => readonly Input[]) | Input,
    ) {
        this.dependencies = dependencies as Slot[]
    }

    dynamicSlot(addresses: {[id: number]: number}): DynamicSlot {
        let getter: (state: EditorState) => any = this.value as any
        let compare = this.facet.compareInput
        let id = this.id,
            idx = addresses[id] >> 1
        let multi = this.flags & ProviderFlag.Multi
        let dependencies = this.dependencies
        // Auto providers mutate `dependencies` during recordAccess.
        let auto: Slot[] | null = this.flags & ProviderFlag.Auto ? dependencies : null
        let depSet = new DependencySet()

        return {
            create(state) {
                state.values[idx] = state.recordAccess(auto, getter)
                return SlotStatus.Changed
            },
            update(state, tr) {
                depSet.update(dependencies, addresses)
                if (
                    (depSet.doc && tr.docChanged) ||
                    (depSet.sel && (tr.docChanged || tr.selection)) ||
                    (depSet.schema && tr.startState.schema != state.schema) ||
                    ensureAll(state, depSet.addrs)
                ) {
                    let newVal = state.recordAccess(auto, getter)
                    if (
                        multi ? !compareArray(newVal, state.values[idx], compare) : !compare(newVal, state.values[idx])
                    ) {
                        state.values[idx] = newVal
                        return SlotStatus.Changed
                    }
                }
                return 0
            },
            reconfigure(state, oldState) {
                let newVal,
                    oldAddr = oldState.config.address[id]
                if (oldAddr != null) {
                    let oldVal = getAddr(oldState, oldAddr)
                    if (
                        dependencies.every((dep) => {
                            return dep instanceof Facet
                                ? oldState.facet(dep) === state.facet(dep)
                                : dep instanceof Field
                                  ? oldState.field(dep, false) == state.field(dep, false)
                                  : true
                        }) ||
                        (multi
                            ? compareArray((newVal = getter(state)), oldVal, compare)
                            : compare((newVal = getter(state)), oldVal))
                    ) {
                        state.values[idx] = oldVal
                        return 0
                    }
                } else {
                    newVal = state.recordAccess(auto, getter)
                }
                state.values[idx] = newVal
                return SlotStatus.Changed
            },
        }
    }
}

function compareArray<T>(a: readonly T[], b: readonly T[], compare: (a: T, b: T) => boolean) {
    if (a.length != b.length) return false
    for (let i = 0; i < a.length; i++) if (!compare(a[i], b[i])) return false
    return true
}

export function ensureAll(state: EditorState, addrs: readonly number[]) {
    let changed = false
    for (let addr of addrs) if (ensureAddr(state, addr) & SlotStatus.Changed) changed = true
    return changed
}

/** Combined facet slot: reads all providers, then `facet.combine`. */
export function dynamicFacetSlot<Input, Output>(
    addresses: {[id: number]: number},
    facet: Facet<Input, Output>,
    providers: readonly FacetProvider<Input>[],
): DynamicSlot {
    let providerAddrs = providers.map((p) => addresses[p.id])
    let dynamic = providerAddrs.filter((p) => !(p & 1))
    let idx = addresses[facet.id] >> 1

    function get(state: EditorState) {
        let values: Input[] = []
        for (let i = 0; i < providerAddrs.length; i++) {
            let value = getAddr(state, providerAddrs[i])
            if (providers[i].flags & ProviderFlag.Multi) for (let val of value) values.push(val)
            else values.push(value)
        }
        return facet.combine(values)
    }

    return {
        create(state) {
            for (let addr of providerAddrs) ensureAddr(state, addr)
            state.values[idx] = get(state)
            return SlotStatus.Changed
        },
        update(state, _tr) {
            if (!ensureAll(state, dynamic)) return 0
            let value = get(state)
            if (facet.compare(value, state.values[idx])) return 0
            state.values[idx] = value
            return SlotStatus.Changed
        },
        reconfigure(state, oldState) {
            let depChanged = ensureAll(state, providerAddrs)
            let oldProviders = oldState.config.facets[facet.id],
                oldValue = oldState.facet(facet)
            if (oldProviders && !depChanged && sameArray(providers, oldProviders)) {
                state.values[idx] = oldValue
                return 0
            }
            let value = get(state)
            if (facet.compare(value, oldValue)) {
                state.values[idx] = oldValue
                return 0
            }
            state.values[idx] = value
            return SlotStatus.Changed
        },
    }
}

/** Ensure a dynamic address is computed; throws on cyclic dependencies. */
export function ensureAddr(state: EditorState, addr: number) {
    if (addr & 1) return SlotStatus.Computed
    let idx = addr >> 1
    let status = state.status[idx]
    if (status == SlotStatus.Computing) throw new Error("Cyclic dependency between fields and/or facets")
    if (status & SlotStatus.Computed) return status
    state.status[idx] = SlotStatus.Computing
    let changed = state.computeSlot!(state, state.config.dynamicSlots[idx])
    return (state.status[idx] = SlotStatus.Computed | changed)
}

export function getAddr(state: EditorState, addr: number) {
    return addr & 1 ? state.config.staticValues[addr >> 1] : state.values[addr >> 1]
}
