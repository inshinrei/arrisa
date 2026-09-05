import {describe, expect, it} from "vitest"
import {Leaf} from "@arrisa/doc"
import {EditorSelection, EditorState, Transaction} from "@arrisa/state"
import {para, runPure, stateFromBlocks} from "./test-helpers"
import {replaceDoc} from "./replace-doc"

describe("replaceDoc", () => {
    it("replaces the document and opts out of history", () => {
        let {state, schema, paragraph} = stateFromBlocks((s) => [para(s, "old")], 1)
        let next = schema.doc([paragraph.create([Leaf.text("new")])])
        let result = runPure(state, replaceDoc, next)
        expect(result.applied).toBe(true)
        expect(result.state.doc.textContent()).toBe("new")
        let tr = state.update(result.spec as Transaction.Spec)
        expect(tr.annotation(Transaction.addToHistory)).toBe(false)
        expect(tr.annotation(Transaction.userEvent)).toBe("set.doc")
    })
})
