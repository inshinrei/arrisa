/**
 * State side-effects carried on a {@link Transaction}.
 *
 * Unlike annotations, effects may be mapped across concurrent changes and can
 * drive reconfiguration (`EditorState.reconfigure`, compartments, etc.).
 * `map` returning `undefined` drops the effect under a mapping.
 */
import type {ChangeSet} from "@arrisa/doc"

export class Effect<Value> {
    constructor(
        readonly type: Effect.Type<Value>,
        readonly value: Value,
    ) {}

    /** Define an effect type; optional `map` remaps the value across changes. */
    static define<Value = null>(spec: Effect.Spec<Value> = {}): Effect.Type<Value> {
        return new Effect.Type(spec.map || ((v) => v))
    }

    /**
     * Map this effect through `mapping`. Returns `undefined` when the type's
     * mapper drops it; returns `this` when the value is unchanged.
     */
    map(mapping: ChangeSet): Effect<Value> | undefined {
        let mapped = this.type.map(this.value, mapping)
        return mapped === undefined
            ? undefined
            : mapped == this.value
              ? this
              : new Effect(this.type, mapped)
    }

    /** Narrow by effect type. */
    is<T>(type: Effect.Type<T>): this is Effect<T> {
        return this.type == (type as any)
    }
}

export namespace Effect {
    /** Map a list of effects, omitting any that drop under the mapping. */
    export function mapEffects(effects: readonly Effect<any>[], mapping: ChangeSet) {
        if (!effects.length) return effects
        let result = []
        for (let effect of effects) {
            let mapped = effect.map(mapping)
            if (mapped) result.push(mapped)
        }
        return result
    }

    export class Type<Value> {
        constructor(
            readonly map: (value: any, mapping: ChangeSet) => any | undefined,
        ) {}

        of(value: Value): Effect<Value> {
            return new Effect(this, value)
        }
    }

    export interface Spec<Value> {
        map?: (value: Value, mapping: ChangeSet) => Value | undefined
    }
}
