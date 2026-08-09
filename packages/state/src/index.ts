/**
 * @arrisa/state — editor state, selection, transactions, textblock maps, bidi, corrections.
 *
 * Static facets and selection factories are installed in this **entry module**
 * (not only via pure re-exports). Under `sideEffects: false`, Rollup drops
 * mutations in intermediate modules when optimizing `export {X} from "./y"`;
 * the entry body always runs.
 */
import {EditorState} from "./state"
import {Transaction, installTransactionFacets} from "./transaction"
import {EditorSelection, installEditorSelectionStatics} from "./selection/selection"
import {TextblockMap} from "./textblock"
import {BidiSpan} from "./bidi"
import {Correction} from "./correction"
import {findClusterBreak} from "./find-cluster-break"
import {
    htmlStringToElement,
    toAssignableHTML,
    wrapMap,
    readDoc,
    type HtmlFromStringOptions,
    type TrustedHTMLPolicy,
    type DocSource,
    type ReadDocOptions,
} from "./state"

// Entry-body installs — retained in library dist under sideEffects: false.
installEditorSelectionStatics()
installTransactionFacets()

export {
    EditorState,
    Transaction,
    EditorSelection,
    TextblockMap,
    BidiSpan,
    Correction,
    findClusterBreak,
    htmlStringToElement,
    toAssignableHTML,
    wrapMap,
    readDoc,
}
export type {HtmlFromStringOptions, TrustedHTMLPolicy, DocSource, ReadDocOptions}
