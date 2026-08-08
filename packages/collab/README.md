# @arrisa/collab

**Collaborative editing for Arrisa** — client OT pipeline, sendable updates, receive/ack, authority-side transform, and safe defaults for remote transaction effects.

Depends only on `@arrisa/doc` and `@arrisa/state` (no view layer).

## Install

```bash
pnpm add @arrisa/collab @arrisa/state @arrisa/doc
# or npm / yarn
```

## Quick start

```ts
import {EditorState} from "@arrisa/state"
import {collab, filterUpdateEffects} from "@arrisa/collab"

let state = EditorState.create({
    doc: initialDoc,
    config: [
        // your schema extensions…
        collab({
            clientID: "alice",
            startVersion: 0,
            // corrections: […],           // share with authority
            // sharedEffects: (tr) => […], // optional effects on the wire
            // filterRemoteEffects: (effects, update) => allowlisted,
        }),
    ],
})

// ── Client send loop ─────────────────────────────────────────────
function flush(state: EditorState) {
    let result = collab.sendableUpdate(state)
    if (!result) return state

    // Promote open → next (pure sendableUpdate does not mutate until you dispatch)
    state = state.apply(result.promote)
    sendToAuthority(result.update) // {version, clientID, changes, effects?}
    return state
}

// ── Client receive (acks + peer updates, contiguous versions) ────
function onAuthorityUpdates(state: EditorState, updates: collab.Update[]) {
    let tr = collab.receive(state, updates)
    return tr.state
}
```

### Authority sketch

```ts
import {collab, filterUpdateEffects} from "@arrisa/collab"

// Client submitted against a stale version — rebase over already-accepted steps
let rebased = collab.transformUpdate(clientUpdate, overEntries, corrections)
if (rebased) {
    // Strip privileged effects before broadcast
    let safe = filterUpdateEffects(rebased, (effect) => isSharedCursorEffect(effect))
    acceptAndBroadcast(safe)
}
```

## Features / concepts

### Single-inflight send pipeline

```
version + syncedDoc   // last authority-confirmed baseline
nextUpdate            // sent (or about to send), awaiting ack
openUpdate            // unsent local edits while next is in flight
```

- Local edits accumulate into `openUpdate` (or `nextUpdate` path after promote).
- `collab.sendableUpdate(state)` is **pure**: returns `{update, promote}` or `null`.
- Apply `promote` so further typing goes to `open` while `next` awaits ack.
- Own-client updates in `receive` are **acks** and must match the in-flight changes (with optional correction recovery).

### Remote effects (security-critical)

**By default, effects on updates from other `clientID`s are dropped on receive.**

This is intentional and safer than pass-through. To share decorations/cursors across peers:

```ts
collab({
    clientID,
    sharedEffects: (tr) => /* effects to attach when doc changes */,
    filterRemoteEffects: (effects, update) =>
        effects.filter((e) => e.is(sharedCursorEffect)),
})
```

Authorities should also strip privileged effects before broadcast with `filterUpdateEffects`.

### Versions

- `CollabUpdate.version` is the authority version the update applies **to** (base before the step).
- After acceptance, authority version becomes `version + 1`.
- `receive` requires contiguous versions (`update.version ==` client’s confirmed version) or throws.

## Main public API

### Install

```ts
import {collab, type CollabConfig, type CollabUpdate, filterUpdateEffects, type SendableResult} from "@arrisa/collab"

collab(config?: CollabConfig): EditorState.Extension
```

#### `CollabConfig`

| Field | Default | Meaning |
|-------|---------|---------|
| `startVersion` | `0` | Initial authority version (must match server doc) |
| `clientID` | random base-36 | Stable peer identity |
| `corrections` | `[]` | Structural corrections when rebasing (share client/server) |
| `sharedEffects` | `() => []` | Effects to attach to local pipeline updates |
| `filterRemoteEffects` | **drop all** | Allowlist remote effects after OT mapping |

### Namespace helpers

```ts
collab.sendableUpdate(state)      // SendableResult | null
collab.hasUnsentUpdate(state)     // boolean
collab.receive(state, updates)    // Transaction (dispatch / .state)
collab.transformUpdate(update, over, corrections?)  // CollabUpdate | null
collab.getSyncedVersion(state)    // number
collab.getClientID(state)         // string

// Types also available as:
// collab.Config, collab.Update, collab.Sendable
```

#### `SendableResult`

```ts
type SendableResult = {
    update: CollabUpdate
    promote: Transaction.Spec // empty if nextUpdate already set
}
```

#### `CollabUpdate`

```ts
interface CollabUpdate {
    version: number
    clientID: string
    changes: ChangeSet
    effects?: readonly Transaction.Effect<unknown>[]
}
```

#### `filterUpdateEffects`

```ts
filterUpdateEffects(update, pred: (effect) => boolean): CollabUpdate
```

Authority helper: keep only matching effects on a wire update.

## Layering / related packages

```
@arrisa/doc + @arrisa/state  →  @arrisa/collab
```

| Package | Relationship |
|---------|----------------|
| `@arrisa/state` | `EditorState`, transactions, corrections, effects |
| `@arrisa/doc` | `ChangeSet` OT transform/compose |
| `@arrisa/editor` | Optional view; collab itself is view-agnostic |
| `@arrisa/table` / schema corrections | Pass the same `corrections` list on client and authority |

Received transactions are annotated **remote** and **not** added to history (undo does not re-apply peer steps).

## Security

Collaboration is a **trust boundary**:

1. **Client:** remote effects dropped unless `filterRemoteEffects` allowlists them.
2. **Authority:** use `filterUpdateEffects` before broadcast; do not rebroadcast admin/UI-only effects.
3. **Documents / HTML:** still sanitize untrusted content; collab does not replace HTML sanitization.

Full guidance: [SECURITY.md](https://github.com/inshinrei/arrisa/blob/main/SECURITY.md).

## License

MIT © [inshinrei](https://github.com/inshinrei)
