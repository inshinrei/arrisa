/**
 * Facets: multi-provider configuration values combined into one output.
 *
 * Providers may be static (`of`), auto-computed (`compute` / `computeN`), or
 * derived from a field (`from`). Static facets may be read from
 * {@link Configuration.staticFacet}; dynamic ones live in state slots.
 */
import type {EditorState} from "./state"
import type {Field} from "./field"
import type {Extension} from "./extension"
import {FacetProvider, ProviderFlag} from "./slot"
import {allocID, none, sameArray} from "./ids"

export class Facet<Input, Output = readonly Input[]> implements Facet.Reader<Output> {
    readonly id = allocID()
    readonly default: Output
    readonly extensions: Extension | undefined
    tag!: Output

    private constructor(
        readonly combine: (values: readonly Input[]) => Output,
        readonly compareInput: (a: Input, b: Input) => boolean,
        readonly compare: (a: Output, b: Output) => boolean,
        readonly isStatic: boolean,
        enables: Extension | undefined | ((self: Facet<Input, Output>) => Extension),
    ) {
        this.default = combine(none)
        this.extensions = typeof enables == "function" ? enables(this) : enables
    }

    get reader(): Facet.Reader<Output> {
        return this
    }

    static define<Input, Output = readonly Input[]>(config: Facet.Spec<Input, Output> = {}) {
        return new Facet<Input, Output>(
            config.combine || (((a: any) => a) as any),
            config.compareInput || ((a, b) => a === b),
            config.compare || (!config.combine ? (sameArray as any) : (a, b) => a === b),
            !!config.static,
            config.enables,
        )
    }

    of(value: Input): Extension {
        return new FacetProvider<Input>(none, this, ProviderFlag.Static, value)
    }

    /** Compute one input; dependencies tracked via state access during create/update. */
    compute(get: (state: EditorState) => Input): Extension {
        if (this.isStatic) throw new Error("Can't compute a static facet")
        return new FacetProvider<Input>([], this, ProviderFlag.Auto, get)
    }

    /** Compute zero or more inputs per state (multi provider). */
    computeN(get: (state: EditorState) => readonly Input[]): Extension {
        if (this.isStatic) throw new Error("Can't compute a static facet")
        return new FacetProvider<Input>([], this, ProviderFlag.Multi | ProviderFlag.Auto, get)
    }

    from<T extends Input>(field: Field<T>): Extension

    from<T>(field: Field<T>, get: (value: T) => Input): Extension

    from<T>(field: Field<T>, get?: (value: T) => Input): Extension {
        if (this.isStatic) throw new Error("Can't compute a static facet")
        if (!get) get = (x) => x as any
        return new FacetProvider<Input>([field], this, 0 as ProviderFlag, (state) => get!(state.field(field)))
    }
}

export namespace Facet {
    export type Spec<Input, Output> = {
        combine?: (value: readonly Input[]) => Output
        compare?: (a: Output, b: Output) => boolean
        compareInput?: (a: Input, b: Input) => boolean
        static?: boolean
        enables?: Extension | ((self: Facet<Input, Output>) => Extension)
    }

    export type Reader<Output> = {
        id: number
        default: Output
        tag: Output
    }

    /** Merge partial config objects with optional per-key combiners. */
    export function combineConfig<Config extends object>(
        configs: readonly Partial<Config>[],
        defaults: Partial<Config>,
        combine: {[P in keyof Config]?: (first: Config[P], second: Config[P]) => Config[P]} = {},
    ): Config {
        let result: any = {}
        for (let config of configs)
            for (let key of Object.keys(config) as (keyof Config)[]) {
                let value = config[key],
                    current = result[key]
                if (current === undefined) result[key] = value
                else if (current === value || value === undefined) {
                } else if (Object.hasOwnProperty.call(combine, key))
                    result[key] = combine[key]!(current as any, value as any)
                else throw new Error("Config merge conflict for field " + (key as string))
            }
        for (let key in defaults) if (result[key] === undefined) result[key] = defaults[key]
        return result
    }
}
