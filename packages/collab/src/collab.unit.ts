import {describe, expect, it} from "vitest"
import {Transaction, type EditorState} from "@arrisa/state"
import {collab} from "./index"
import {apply, deleteRange, insertChange, makeState, makeStateWith, typeAt} from "./test-helpers"

/** Take sendable payload and apply promote so next is installed. */
function takeSendable(state: EditorState) {
    let result = collab.sendableUpdate(state)!
    expect(result).not.toBeNull()
    return {state: apply(state, result.promote), update: result.update}
}

describe("collab install and queries", () => {
    it("installs with defaults (version 0, generated clientID)", () => {
        let {state} = makeState("hi", {})
        expect(collab.getSyncedVersion(state)).toBe(0)
        expect(collab.getClientID(state).length).toBeGreaterThan(0)
        expect(collab.hasUnsentUpdate(state)).toBe(false)
        expect(collab.sendableUpdate(state)).toBeNull()
    })

    it("respects startVersion and clientID config", () => {
        let {state} = makeState("hi", {startVersion: 7, clientID: "alice"})
        expect(collab.getSyncedVersion(state)).toBe(7)
        expect(collab.getClientID(state)).toBe("alice")
    })
})

describe("local accumulate and send", () => {
    it("records local edits as unsent and sendable", () => {
        let {state} = makeState("hi", {clientID: "c1"})
        state = typeAt(state, 1, "X")
        expect(state.doc.textContent()).toBe("Xhi")
        expect(collab.hasUnsentUpdate(state)).toBe(true)

        let {state: promoted, update} = takeSendable(state)
        expect(update.clientID).toBe("c1")
        expect(update.version).toBe(0)
        expect(update.changes.empty).toBe(false)
        expect(collab.hasUnsentUpdate(promoted)).toBe(true)
    })

    it("returns the same nextUpdate until acked", () => {
        let {state} = makeState("ab", {clientID: "c1"})
        state = typeAt(state, 1, "Z")
        let first = takeSendable(state)
        state = first.state
        let second = collab.sendableUpdate(state)!
        expect(second.update.version).toBe(first.update.version)
        expect(second.update.changes.eq(first.update.changes)).toBe(true)
        // Re-read does not need another promote (already next).
        expect(second.promote.effects).toBeUndefined()
    })

    it("accumulates further edits into open after send", () => {
        let {state} = makeState("ab", {clientID: "c1"})
        state = typeAt(state, 1, "1")
        let taken = takeSendable(state)
        state = taken.state
        expect(taken.update.version).toBe(0)

        state = typeAt(state, 2, "2")
        expect(collab.hasUnsentUpdate(state)).toBe(true)
        // Still returns the in-flight next (first send), not the open edit.
        let again = collab.sendableUpdate(state)!
        expect(again.update.changes.eq(taken.update.changes)).toBe(true)
        expect(state.doc.textContent()).toBe("12ab")
    })

    it("includes sharedEffects on sendable updates", () => {
        let tag = Transaction.Effect.define<number>()
        let {state} = makeStateWith("hi", [
            collab({
                clientID: "c1",
                sharedEffects: (tr) => (tr.docChanged ? [tag.of(42)] : []),
            }),
        ])
        state = typeAt(state, 1, "X")
        let {update} = takeSendable(state)
        expect(update.effects?.length).toBe(1)
        expect(update.effects![0].is(tag)).toBe(true)
        expect(update.effects![0].value).toBe(42)
    })

    it("does not mutate field state without applying promote", () => {
        let {state} = makeState("ab", {clientID: "c1"})
        state = typeAt(state, 1, "1")
        let peek = collab.sendableUpdate(state)!
        // Peek alone leaves open as the only pipeline slot; further edits compose into open.
        state = typeAt(state, 2, "2")
        let after = collab.sendableUpdate(state)!
        expect(after.update.changes.eq(peek.update.changes)).toBe(false)
        expect(state.doc.textContent()).toBe("12ab")
    })
})

describe("receive — ack own update", () => {
    it("clears nextUpdate and advances version on own ack", () => {
        let {state} = makeState("hi", {clientID: "c1"})
        state = typeAt(state, 1, "X")
        let {state: promoted, update} = takeSendable(state)
        state = promoted
        let tr = collab.receive(state, [update])
        state = tr.state
        expect(collab.getSyncedVersion(state)).toBe(1)
        expect(collab.hasUnsentUpdate(state)).toBe(false)
        expect(state.doc.textContent()).toBe("Xhi")
        expect(tr.annotation(Transaction.remote)).toBe(true)
        expect(tr.annotation(Transaction.addToHistory)).toBe(false)
    })

    it("after ack, open edits become the next sendable", () => {
        let {state} = makeState("ab", {clientID: "c1"})
        state = typeAt(state, 1, "1")
        let first = takeSendable(state)
        state = first.state
        state = typeAt(state, 2, "2")
        state = collab.receive(state, [first.update]).state
        expect(collab.getSyncedVersion(state)).toBe(1)
        expect(collab.hasUnsentUpdate(state)).toBe(true)
        let second = takeSendable(state)
        expect(second.update.version).toBe(1)
        expect(second.state.doc.textContent()).toBe("12ab")
    })

    it("throws when own clientID arrives with no nextUpdate", () => {
        let {state, doc} = makeState("hi", {clientID: "c1"})
        let fake = {
            version: 0,
            clientID: "c1",
            changes: insertChange(doc, 1, "X"),
        }
        expect(() => collab.receive(state, [fake])).toThrow(/unknown update with our client ID/)
    })

    it("throws when own ack changes do not match", () => {
        let {state, doc} = makeState("hi", {clientID: "c1"})
        state = typeAt(state, 1, "X")
        state = takeSendable(state).state
        let wrong = {
            version: 0,
            clientID: "c1",
            changes: insertChange(doc, 1, "Y"),
        }
        expect(() => collab.receive(state, [wrong])).toThrow(/doesn't match our own local update/)
    })

    it("throws on version mismatch", () => {
        let {state, doc} = makeState("hi", {clientID: "c1", startVersion: 0})
        let remote = {
            version: 3,
            clientID: "other",
            changes: insertChange(doc, 1, "Z"),
        }
        expect(() => collab.receive(state, [remote])).toThrow(/Version mismatch/)
    })
})

describe("receive — remote updates", () => {
    it("applies a remote peer update to the document", () => {
        let {state, doc} = makeState("hi", {clientID: "c1"})
        let remoteChanges = insertChange(doc, 1, "R")
        let tr = collab.receive(state, [
            {version: 0, clientID: "peer", changes: remoteChanges},
        ])
        state = tr.state
        expect(state.doc.textContent()).toBe("Rhi")
        expect(collab.getSyncedVersion(state)).toBe(1)
        expect(collab.hasUnsentUpdate(state)).toBe(false)
        expect(tr.annotation(Transaction.remote)).toBe(true)
    })

    it("drops remote effects by default", () => {
        let tag = Transaction.Effect.define<number>()
        let {state, doc} = makeState("hi", {clientID: "c1"})
        let remoteChanges = insertChange(doc, 1, "R")
        let tr = collab.receive(state, [
            {
                version: 0,
                clientID: "peer",
                changes: remoteChanges,
                effects: [tag.of(99)],
            },
        ])
        expect(tr.effects.some((e) => e.is(tag))).toBe(false)
        expect(tr.state.doc.textContent()).toBe("Rhi")
    })

    it("keeps remote effects allowlisted by filterRemoteEffects", () => {
        let tag = Transaction.Effect.define<number>()
        let {state, doc} = makeState("hi", {
            clientID: "c1",
            filterRemoteEffects: (effects) => effects.filter((e) => e.is(tag)),
        })
        let remoteChanges = insertChange(doc, 1, "R")
        let tr = collab.receive(state, [
            {
                version: 0,
                clientID: "peer",
                changes: remoteChanges,
                effects: [tag.of(42)],
            },
        ])
        let found = tr.effects.find((e) => e.is(tag))
        expect(found?.value).toBe(42)
    })

    it("transforms concurrent local open edit over remote", () => {
        // Local inserts at start; remote inserts at end of "ab" (pos 3).
        let {state, doc} = makeState("ab", {clientID: "c1"})
        state = typeAt(state, 1, "L") // "Lab"
        let remote = insertChange(doc, 3, "R") // authority base "ab" → "abR"
        state = collab.receive(state, [{version: 0, clientID: "peer", changes: remote}]).state
        // Both inserts should survive OT.
        expect(state.doc.textContent()).toBe("LabR")
        expect(collab.getSyncedVersion(state)).toBe(1)
        expect(collab.hasUnsentUpdate(state)).toBe(true)
        let sent = takeSendable(state)
        expect(sent.update.version).toBe(1)
    })

    it("transforms over nextUpdate and openUpdate", () => {
        let {state, doc} = makeState("ab", {clientID: "c1"})
        state = typeAt(state, 1, "1")
        state = takeSendable(state).state // next = insert "1"
        state = typeAt(state, 2, "2") // open = insert "2" after "1"
        expect(state.doc.textContent()).toBe("12ab")

        let remote = insertChange(doc, 3, "R") // at end of original "ab"
        state = collab.receive(state, [{version: 0, clientID: "peer", changes: remote}]).state
        expect(state.doc.textContent()).toBe("12abR")
        expect(collab.getSyncedVersion(state)).toBe(1)
        // next still in flight; open still unsent
        expect(collab.hasUnsentUpdate(state)).toBe(true)
        let next = collab.sendableUpdate(state)!
        expect(next.update.version).toBe(1)
    })
})

describe("transformUpdate (authority)", () => {
    it("returns identity when over is empty", () => {
        let {doc} = makeState("hi")
        let update = {
            version: 0,
            clientID: "c1",
            changes: insertChange(doc, 1, "X"),
        }
        expect(collab.transformUpdate(update, [])).toBe(update)
    })

    it("returns null when same client already accepted", () => {
        let {doc} = makeState("hi")
        let changes = insertChange(doc, 1, "X")
        let update = {version: 0, clientID: "c1", changes}
        let result = collab.transformUpdate(update, [{doc, changes, clientID: "c1"}])
        expect(result).toBeNull()
    })

    it("rebases over a concurrent peer update and bumps version", () => {
        let {doc} = makeState("ab")
        // Client inserts at start; concurrent peer inserts at end.
        let client = insertChange(doc, 1, "L")
        let peer = insertChange(doc, 3, "R")
        let rebased = collab.transformUpdate(
            {version: 0, clientID: "c1", changes: client},
            [{doc, changes: peer, clientID: "peer"}],
        )!
        expect(rebased).not.toBeNull()
        expect(rebased.version).toBe(1)
        expect(rebased.clientID).toBe("c1")
        // After peer's "ab" → "abR", client insert at 1 still yields "LabR".
        let afterPeer = peer.apply(doc)
        expect(rebased.changes.apply(afterPeer).textContent()).toBe("LabR")
    })
})

describe("empty / no-op paths", () => {
    it("does not mark unsent for empty transactions", () => {
        let {state} = makeState("hi", {clientID: "c1"})
        state = apply(state, {selection: state.selection})
        expect(collab.hasUnsentUpdate(state)).toBe(false)
    })

    it("delete then send produces non-empty changes", () => {
        let {state} = makeState("hello", {clientID: "c1"})
        // doc layout: <doc><p>hello</p></doc> — text starts at 1
        state = deleteRange(state, 1, 2) // remove 'h'
        expect(state.doc.textContent()).toBe("ello")
        let {update} = takeSendable(state)
        expect(update.changes.empty).toBe(false)
    })
})
