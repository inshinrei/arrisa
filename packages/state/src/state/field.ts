/**
 * State fields: named values that live on {@link EditorState}, created once
 * and updated per transaction. Optionally provide extensions (e.g. facets
 * derived from the field value).
 */
import type {EditorState} from "./state"
import type {Transaction} from "../transaction"
import type {Extension} from "./extension"
import type {DynamicSlot} from "./slot"
import {SlotStatus} from "./slot"
import {allocID} from "./ids"
import {Facet} from "./facet"

/**
 * Override a field's `create` when building a state (e.g. JSON restore).
 * Lives here (not in `./facets`) so `field` does not import `facets` and
 * complete the facets → facet → slot → field → facets cycle that can evaluate
 * `Facet.define` before the Facet class exists in the library bundle.
 */
export const initField = Facet.define<{field: Field<unknown>; create: (state: EditorState) => unknown}>({
    static: true,
})

export class Field<Value> {
    public provides: Extension | undefined = undefined

    private constructor(
        readonly id: number,
        private createF: (state: EditorState) => Value,
        private updateF: (value: Value, tr: Transaction) => Value,
        private compareF: (a: Value, b: Value) => boolean,
        readonly spec: Field.Spec<Value>,
    ) {}

    get extension(): Extension {
        return this
    }

    static define<Value>(config: Field.Spec<Value>): Field<Value> {
        let field = new Field<Value>(
            allocID(),
            config.create,
            config.update,
            config.compare || ((a, b) => a === b),
            config,
        )
        if (config.provide) field.provides = config.provide(field)
        return field
    }

    /** Build the dynamic slot for this field at the given address table. */
    slot(addresses: {[id: number]: number}): DynamicSlot {
        let idx = addresses[this.id] >> 1
        return {
            create: (state) => {
                state.values[idx] = this.create(state)
                return SlotStatus.Changed
            },
            update: (state, tr) => {
                let oldVal = state.values[idx]
                let value = this.updateF(oldVal, tr)
                if (this.compareF(oldVal, value)) return 0
                state.values[idx] = value
                return SlotStatus.Changed
            },
            reconfigure: (state, oldState) => {
                if (oldState.config.address[this.id] != null) {
                    state.values[idx] = oldState.field(this)
                    return 0
                }
                state.values[idx] = this.create(state)
                return SlotStatus.Changed
            },
        }
    }

    /** Override initial create for this field when assembling a config. */
    init(create: (state: EditorState) => Value): Extension {
        return [this, initField.of({field: this as any, create})]
    }

    private create(state: EditorState) {
        let init = state.facet(initField).find((i) => i.field == this)
        return (init?.create || this.createF)(state)
    }
}

export namespace Field {
    export type Spec<Value> = {
        create: (state: EditorState) => Value
        update: (value: Value, transaction: Transaction) => Value
        compare?: (a: Value, b: Value) => boolean
        provide?: (field: Field<Value>) => Extension
        toJSON?: (value: Value, state: EditorState) => any
        fromJSON?: (json: any, state: EditorState) => Value
    }
}
