/**
 * @arrisa/collab — collaborative editing for Arrisa (OT pipeline + corrections).
 *
 * **Usage**
 * - Install: `collab({clientID, startVersion, corrections, sharedEffects, filterRemoteEffects})`
 * - Client: {@link collab.sendableUpdate} → apply promote → authority →
 *   {@link collab.receive}
 * - Authority: {@link collab.transformUpdate} for stale client submissions;
 *   use {@link filterUpdateEffects} to strip privileged effects before broadcast
 *
 * **Remote effects (breaking default):** effects from other clients are dropped
 * on receive unless `filterRemoteEffects` allowlists them.
 *
 * **Pipeline** (single inflight send): `syncedDoc`/`version` baseline, then
 * `nextUpdate` (sent, awaiting ack) and `openUpdate` (unsent, composed while next
 * is in flight). Promotion is a normal field update, not an in-place write.
 *
 * Layering: `@arrisa/doc` + `@arrisa/state` → this package (collab field + OT).
 */
export {collab} from "./collab"
export type {CollabConfig} from "./config"
export type {CollabUpdate} from "./update"
export {filterUpdateEffects} from "./update"
export type {SendableResult} from "./send"
