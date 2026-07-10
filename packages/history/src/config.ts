/**
 * History configuration facet (depth limits, grouping delay, join predicate).
 */
import {EditorState, type Transaction} from "@arrisa/state"

export interface HistoryConfig {
    /** Minimum number of undo events to keep. Defaults to 100. */
    minDepth?: number
    /**
     * Max ms between adjacent joinable edits that may still merge into one
     * undo event. Defaults to 500.
     */
    newGroupDelay?: number
    /**
     * Whether a new transaction should join the previous event. Default joins
     * only when the change ranges touch (`isAdjacent`).
     */
    joinToEvent?: (tr: Transaction, isAdjacent: boolean) => boolean
}

export const historyConfig = EditorState.Facet.define<HistoryConfig, Required<HistoryConfig>>({
    combine(configs) {
        return EditorState.Facet.combineConfig(
            configs,
            {
                minDepth: 100,
                newGroupDelay: 500,
                joinToEvent: (_t, isAdjacent) => isAdjacent,
            },
            {
                minDepth: Math.max,
                newGroupDelay: Math.min,
                joinToEvent: (a, b) => (tr, adj) => a(tr, adj) || b(tr, adj),
            },
        )
    },
})
