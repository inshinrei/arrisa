import {describe, expect, it} from "vitest"
import {EditorState} from "@arrisa/state"
import {Command} from "./command"
import {mockArrisa, para, stateFromBlocks} from "./test-helpers"

describe("Command.bind", () => {
    it("pairs a command with a parameter", () => {
        let cmd: Command<string> = () => false
        let bound = Command.bind(cmd, "hello")
        expect(bound.command).toBe(cmd)
        expect(bound.param).toBe("hello")
    })
})

describe("Command.dispatch", () => {
    it("applies a transaction spec returned by the command", () => {
        let {state} = stateFromBlocks((s) => [para(s, "hi")], 1)
        let editor = mockArrisa(state)
        let cmd: Command = () => ({
            selection: state.selection,
            userEvent: "test",
        })
        expect(Command.dispatch(editor, cmd)).toBe(true)
        expect(editor.dispatched).toHaveLength(1)
        expect(editor.dispatched[0].userEvent).toBe("test")
    })

    it("returns false when the command returns false", () => {
        let {state} = stateFromBlocks((s) => [para(s, "hi")], 1)
        let editor = mockArrisa(state)
        let cmd: Command = () => false
        expect(Command.dispatch(editor, cmd)).toBe(false)
        expect(editor.dispatched).toHaveLength(0)
    })

    it("runs the first successful handler before the command body", () => {
        let bodyCalled = false
        let cmd: Command = () => {
            bodyCalled = true
            return false
        }
        let handler: Command = () => true
        let {state: base} = stateFromBlocks((s) => [para(s, "hi")], 1)
        let withHandler = EditorState.create({
            doc: base.doc,
            selection: base.selection,
            config: [EditorState.schemaElement.of(base.schema.elements), Command.handler(cmd, handler)],
        })
        let editor = mockArrisa(withHandler)
        expect(Command.dispatch(editor, cmd)).toBe(true)
        expect(bodyCalled).toBe(false)
    })

    it("falls through to the command when handlers return false", () => {
        let bodyCalled = false
        let cmd: Command = () => {
            bodyCalled = true
            return true
        }
        let handler: Command = () => false
        let {state: base} = stateFromBlocks((s) => [para(s, "hi")], 1)
        let withHandler = EditorState.create({
            doc: base.doc,
            selection: base.selection,
            config: [EditorState.schemaElement.of(base.schema.elements), Command.handler(cmd, handler)],
        })
        let editor = mockArrisa(withHandler)
        expect(Command.dispatch(editor, cmd)).toBe(true)
        expect(bodyCalled).toBe(true)
    })

    it("dispatches a bound command with its fixed parameter", () => {
        let seen: unknown = undefined
        let cmd: Command<number> = (_, n) => {
            seen = n
            return true
        }
        let {state} = stateFromBlocks((s) => [para(s, "hi")], 1)
        let editor = mockArrisa(state)
        expect(Command.dispatch(editor, Command.bind(cmd, 42))).toBe(true)
        expect(seen).toBe(42)
    })
})
