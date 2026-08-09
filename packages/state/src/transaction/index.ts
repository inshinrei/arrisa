/**
 * Transaction surface: change specs, effects, annotations, and resolve helpers.
 */
import {installTransactionFacets} from "./install-facets"

// Ensure facets exist for source tests and any import of this barrel.
// Package entry also calls install (entry body is not tree-shaken in dist).
installTransactionFacets()

export {Transaction} from "./transaction"
export {installTransactionFacets} from "./install-facets"
export {Effect} from "./effect"
export {Annotation, time, userEvent, addToHistory, remote, appended} from "./annotation"
export {
    resolveTransaction,
    resolveTransactionInner,
    mergeTransaction,
    asArray,
    type ResolvedSpec,
} from "./resolve"
