# AGENTS.md

> Guidelines for AI coding agents working in projects that depend on `@arrisa/collab` (when installed from npm).
>
> This lightweight guide is copied to `dist/AGENTS.md` during build and ships inside the published package.

## When to use

- Multi-user **operational transformation** over Arrisa documents.
- You need a **client send/receive pipeline** and/or **authority rebase** (`transformUpdate`).
- Not required for single-user editors.

## Public API patterns

```ts
import {EditorState} from "@arrisa/state"
import {collab, filterUpdateEffects, type CollabUpdate} from "@arrisa/collab"

let state = EditorState.create({
    doc,
    config: [
        collab({
            clientID: "alice",
            startVersion: serverVersion,
            corrections: sharedCorrections,
            sharedEffects: (tr) => /* optional */,
            filterRemoteEffects: (effects) => effects.filter(isAllowed),
        }),
    ],
})

// Send
let result = collab.sendableUpdate(state)
if (result) {
    state = state.apply(result.promote)
    transport.send(result.update)
}

// Receive (acks + peers; contiguous versions)
let tr = collab.receive(state, updatesFromServer)
state = tr.state

// Authority
let next = collab.transformUpdate(staleClientUpdate, over, sharedCorrections)
if (next) broadcast(filterUpdateEffects(next, allowPred))
```

| Export | Role |
|--------|------|
| `collab(config?)` | Extension: field + config facet |
| `collab.sendableUpdate` | Pure next payload + promote spec |
| `collab.hasUnsentUpdate` | In-flight or unsent local work |
| `collab.receive` | Apply authority updates → `Transaction` |
| `collab.transformUpdate` | Authority rebase; `null` if duplicate same-client step |
| `collab.getSyncedVersion` / `getClientID` | Queries |
| `CollabConfig`, `CollabUpdate`, `SendableResult` | Types (also `collab.Config` / `Update` / `Sendable`) |
| `filterUpdateEffects` | Authority strip of effects before broadcast |

## Invariants / pitfalls

1. **Single inflight send** — at most one `nextUpdate` awaiting ack; further edits go to `openUpdate` after promote.
2. **`sendableUpdate` is pure** — must `apply`/`dispatch` `promote` or the field stays unpromoted and later peeks recompose into open.
3. **Re-reading sendable while next is set** returns the same update with **empty** promote (idempotent).
4. **Receive version order** — each update’s `version` must equal the client’s confirmed version; mismatch throws.
5. **Own `clientID` on receive = ack** — changes must match local `nextUpdate` (or match after shared correction recovery); otherwise throws.
6. **Remote effects default drop** — empty allowlist. Allow only effects you define and trust. This is a **security default**, not an accident.
7. **Share `corrections` client/server** — table/structure corrections must match so OT + correction agree.
8. **`sharedEffects`** extract effects from local transactions for the pipeline; they are remapped under concurrent transforms like changes.
9. **Receive annotations** — remote transactions are marked remote and not added to history.
10. Prefer **`let`** in examples; `const` only for arrow functions / true globals.

## What not to do

- Do **not** assume remote effects apply unless you wrote `filterRemoteEffects`.
- Do **not** rebroadcast unfiltered effects from clients on the authority.
- Do **not** mutate collab field state outside `promote` / `receive` transactions.
- Do **not** invent multi-inflight send without replacing this pipeline design.
- Do **not** treat collab as HTML/XSS protection — still sanitize untrusted docs/paste.
- Do **not** skip applying `promote` before further local edits you intend to batch separately from the in-flight send.

## Related packages

| Package | Use when |
|---------|----------|
| `@arrisa/state` | State, transactions, corrections, effects |
| `@arrisa/doc` | `ChangeSet` OT primitives |
| `@arrisa/table` | Include `tableCorrection` in shared `corrections` for table docs |
| `@arrisa/editor` | View only; collab works headlessly |

## When in doubt

- Follow the unit-tested loop: edit → `sendableUpdate` → apply `promote` → send → `receive` ack/peers.
- Read [SECURITY.md](https://github.com/inshinrei/arrisa/blob/main/SECURITY.md) § collaboration effects before shipping multiplayer.
- Check `dist/index.d.ts` for exact types.

## Keep in sync

When changing public exports or recommended usage, update this file and `README.md` in the same change. Only document what `src/index.ts` re-exports.
