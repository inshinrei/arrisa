import {EditorState} from "./state"
import {EditorSelection} from "../selection"
import {SelectionType} from "../selection/type"
import {Transaction} from "../transaction"
import {Facet} from "./facet"

// Wire facets that depend on both state and selection/transaction modules.
// Assigned here (not `export let` in the Transaction namespace) so Vite/Oxc
// does not emit unsupported namespace `export let`, and Facet is fully init.
EditorSelection.selectionType = Facet.define<SelectionType>({
    combine(values) {
        let types = [EditorSelection.Text.type, EditorSelection.Node.type, ...values]
        for (let i = 0; i < types.length; i++)
            for (let j = i + 1; j < types.length; j++) {
                if (types[i].tag == types[j].tag) throw new Error("Duplicate selection JSON tag: " + types[i].tag)
            }
        return types
    },
    static: true,
})

Transaction.extender = Facet.define()
Transaction.appender = Facet.define()

export {EditorState}
export type {Extension} from "./extension"
export type {DocSource, ReadDocOptions} from "./doc-source"
export {readDoc} from "./doc-source"
export {
    htmlStringToElement,
    toAssignableHTML,
    wrapMap,
    type HtmlFromStringOptions,
    type TrustedHTMLPolicy,
} from "./html-from-string"
export {Field} from "./field"
export {Facet} from "./facet"
export {Configuration, Compartment, prec} from "./configuration"
export {
    schemaElement,
    readOnly,
    textLTR,
    textblockLTR,
    visualCursorMotion,
    initField,
} from "./facets"
