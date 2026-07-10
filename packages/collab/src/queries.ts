/**
 * Read-only collab queries (version and client identity).
 */
import type {EditorState} from "@arrisa/state"
import {collabConfig} from "./config"
import {collabField} from "./field"

/** Authority version this client has confirmed through. */
export function getSyncedVersion(state: EditorState) {
    return state.field(collabField).version
}

/** This client's collaborative editing id. */
export function getClientID(state: EditorState) {
    return state.facet(collabConfig).clientID
}
