/**
 * Collaborative editing configuration facet.
 *
 * Install via {@link collab}; values combine with {@link EditorState.Facet.combineConfig}.
 * When `clientID` is omitted, a random id is generated once at extension install time.
 *
 * **Remote effects:** by default, effects on updates from other `clientID`s are
 * **dropped** on receive. Use {@link CollabConfig.filterRemoteEffects} to allowlist
 * effects that should apply locally. Authority servers should also strip
 * privileged effects before broadcast (see {@link filterUpdateEffects}).
 */
import type {Correction, Transaction} from "@arrisa/state"
import {EditorState} from "@arrisa/state"
import type {CollabUpdate} from "./update"

export interface CollabConfig {
    /**
     * Document version at which this client starts (must match the authority's
     * version for the initial document). Defaults to 0.
     */
    startVersion?: number

    /**
     * Stable identity for this client among collaborators. Defaults to a
     * random base-36 string generated when the extension is installed.
     */
    clientID?: string

    /**
     * Structural corrections used when rebasing local updates over remote ones
     * (and on the authority via {@link collab.transformUpdate}). Same list should be
     * shared client/server so OT results stay consistent with document rules.
     */
    corrections?: readonly Correction[]

    /**
     * Extract effects that should travel with document changes (e.g. decorations
     * or metadata shared across peers). Returned effects are remapped under
     * concurrent transforms like document changes.
     */
    sharedEffects?: (tr: Transaction) => readonly Transaction.Effect<any>[]

    /**
     * Called for effects on updates where `update.clientID !== this clientID`
     * (after OT mapping). Default drops **all** remote effects (safe default;
     * breaking vs pre-security pass-through).
     *
     * Return the effects to apply locally (allowlist).
     */
    filterRemoteEffects?: (
        effects: readonly Transaction.Effect<unknown>[],
        update: CollabUpdate,
    ) => readonly Transaction.Effect<unknown>[]
}

/** Internal facet payload includes the one-shot generated client id seed. */
export type CollabConfigInternal = CollabConfig & {generatedID: string}

function dropRemoteEffects(): readonly Transaction.Effect<unknown>[] {
    return []
}

/**
 * Combined collab configuration. `clientID` is always a concrete string after
 * combine (generated when the user did not supply one).
 */
export const collabConfig = EditorState.Facet.define<CollabConfigInternal, Required<CollabConfig>>({
    combine(configs) {
        let combined = EditorState.Facet.combineConfig(
            configs,
            {
                startVersion: 0,
                clientID: null as any,
                sharedEffects: () => [],
                corrections: [],
                filterRemoteEffects: dropRemoteEffects,
            },
            {
                generatedID: (a) => a,
            },
        )
        if (combined.clientID == null) combined.clientID = (configs.length && configs[0].generatedID) || ""
        return combined
    },
})
