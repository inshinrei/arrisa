/**
 * Built-in facets for schema, editing direction, and field initialization.
 */
import type {Plot, Schema} from "@arrisa/doc"
import {Facet} from "./facet"
import type {Field} from "./field"
import type {EditorState} from "./state"
import {none} from "./ids"

/** Override a field's `create` when building a state (e.g. JSON restore). */
export const initField = Facet.define<{field: Field<unknown>; create: (state: EditorState) => unknown}>({
    static: true,
})

/** Schema elements (doc/plot/mark types) used to build {@link Schema}. */
export const schemaElement = Facet.define<Schema.Element | readonly Schema.Element[], readonly Schema.Element[]>({
    combine: (values) => values.reduce((set: readonly Schema.Element[], elt) => set.concat(elt), none),
    static: true,
})

/** When true, the editor should refuse content edits. */
export const readOnly = Facet.define<boolean, boolean>({
    combine: (values) => (values.length ? values[0] : false),
})

/** Base text direction for the document (true = LTR). */
export const textLTR = Facet.define<boolean, boolean>({
    combine: (values) => (values.length ? values[0] : true),
    static: true,
})

/** Per-plot LTR override; first non-null wins, else {@link textLTR}. */
export const textblockLTR = Facet.define<(plot: Plot) => boolean | null>({
    static: true,
})

/** Prefer visual (bidi) cursor motion when true (default). */
export const visualCursorMotion = Facet.define<boolean, boolean>({
    combine(values) {
        return !values.length ? true : values[0]
    },
    static: true,
})
