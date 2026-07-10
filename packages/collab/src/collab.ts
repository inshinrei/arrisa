/**
 * Collaborative editing extension for Arrisa editor state.
 *
 * Install with {@link collab}. Typical client loop:
 *
 * 1. Local edits accumulate into the open pipeline automatically.
 * 2. {@link collab.sendableUpdate} yields the next batch and a promote spec;
 *    apply `promote` then push `update` to the authority.
 * 3. When the authority returns new updates (including acks), apply them with
 *    {@link collab.receive}.
 * 4. The authority may rebase stale client pushes with {@link collab.transformUpdate}.
 *
 * This package uses a single-inflight pipeline (`nextUpdate` / `openUpdate`) and
 * optional {@link Correction}s so structured documents stay consistent under OT.
 */
import type {EditorState} from "@arrisa/state"
import type {CollabConfig} from "./config"
import {collabConfig} from "./config"
import {collabField} from "./field"
import {getClientID as getClientID_, getSyncedVersion as getSyncedVersion_} from "./queries"
import {receive as receive_} from "./receive"
import {
    hasUnsentUpdate as hasUnsentUpdate_,
    sendableUpdate as sendableUpdate_,
    type SendableResult,
} from "./send"
import {transformUpdate as transformUpdate_} from "./transform"
import type {CollabUpdate} from "./update"

/** Create a collaborative editing extension with optional configuration. */
export function collab(config: CollabConfig = {}): EditorState.Extension {
    return [collabField, collabConfig.of({generatedID: Math.floor(Math.random() * 1e9).toString(36), ...config})]
}

export namespace collab {
    export type Config = CollabConfig
    export type Update = CollabUpdate
    export type Sendable = SendableResult

    /** Apply authority updates; returns a transaction to dispatch. */
    export const receive = receive_

    /**
     * Local update ready to send. Pure: does not mutate collab field state.
     * Apply `result.promote` (then push `result.update`) so further edits go to
     * open while next is in flight. Returns `null` when fully synced.
     */
    export const sendableUpdate = sendableUpdate_

    /** Whether any local update is in-flight or still unsent. */
    export const hasUnsentUpdate = hasUnsentUpdate_

    /** Authority version this client has confirmed through. */
    export const getSyncedVersion = getSyncedVersion_

    /** This client's collaborative editing id. */
    export const getClientID = getClientID_

    /**
     * Authority-side: rebase a client update over already-accepted updates.
     * Returns `null` when the update is a duplicate of an accepted same-client batch.
     * Strip privileged effects before broadcast (see {@link filterUpdateEffects}).
     */
    export const transformUpdate = transformUpdate_
}

export {filterUpdateEffects} from "./update"
