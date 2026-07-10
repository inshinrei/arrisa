/**
 * In-memory collab field value: authority baseline plus the local send pipeline.
 *
 * Pipeline (single-inflight design):
 *
 * ```
 * version + syncedDoc   // last authority-confirmed baseline
 * nextUpdate            // local update currently sent, awaiting ack
 * openUpdate            // further local edits composed while next is in flight
 * ```
 *
 * All transitions install a new {@link CollabState} (field update / receive /
 * promote effects). Fields are immutable after construction.
 */
import type {Plot} from "@arrisa/doc"
import type {LocalUpdate} from "./local-update"

export class CollabState {
    constructor(
        /** Authority version this client has confirmed through. */
        readonly version: number,

        /**
         * Document content as last confirmed by the authority (before any
         * unconfirmed local pipeline).
         */
        readonly syncedDoc: Plot.Doc,

        /**
         * Local update that has been (or is about to be) sent and is waiting
         * for an authority ack. At most one at a time.
         */
        readonly nextUpdate: LocalUpdate | null,

        /**
         * Unsent local edits accumulated after `nextUpdate` was promoted.
         * Composed into a single update when sent.
         */
        readonly openUpdate: LocalUpdate | null,
    ) {}
}
