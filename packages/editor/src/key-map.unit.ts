import {describe, expect, it} from "vitest"
import {Leaf, Plot, Schema} from "@arrisa/doc"
import {EditorSelection, EditorState, type Transaction} from "@arrisa/state"
import browser from "./browser"
import {KeyBinding, normalizeKeyName, modifiers} from "./key-map"

function arrowDoc(text = "hello world") {
    let paragraph = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let docType = Plot.defineDoc({blockContent: paragraph})
    let schema = Schema.define([docType, paragraph])
    return schema.doc([paragraph.create([Leaf.text(text)])])
}

function mockKeyEditor(state: EditorState, lineAt: (forward: boolean) => number) {
    let current = state
    let dispatched: Transaction.Spec[] = []
    let editor = {
        get state() {
            return current
        },
        dispatched,
        dispatch(...specs: Transaction.Spec[]) {
            for (let s of specs) {
                dispatched.push(s)
                current = current.update(s).state
            }
        },
        moveToLineBoundary(_sel: EditorSelection, forward: boolean) {
            return EditorSelection.cursor(lineAt(forward))
        },
        moveVertically() {
            return null
        },
        scrollDOM: {clientHeight: 400},
        dom: {ownerDocument: {defaultView: {innerHeight: 800}}},
    }
    return editor as any
}

function keyEvent(key: string, mods: {alt?: boolean; ctrl?: boolean; meta?: boolean; shift?: boolean}) {
    return {
        key,
        altKey: !!mods.alt,
        ctrlKey: !!mods.ctrl,
        metaKey: !!mods.meta,
        shiftKey: !!mods.shift,
        keyCode: 0,
        preventDefault() {},
        getModifierState() {
            return false
        },
    } as unknown as KeyboardEvent
}

describe("defaultKeymap", () => {
    it("binds Escape with allowDefault so empty collapse does not preventDefault", () => {
        let escape = KeyBinding.defaultKeymap.find((b) => b.spec.key == "Escape")
        expect(escape?.spec.allowDefault).toBe(true)
    })
})

describe("normalizeKeyName", () => {
    it("maps Mod to Meta on mac and Ctrl elsewhere", () => {
        expect(normalizeKeyName("Mod-a", "mac")).toBe("Meta-a")
        expect(normalizeKeyName("Mod-a", "win")).toBe("Ctrl-a")
        expect(normalizeKeyName("Mod-a", "linux")).toBe("Ctrl-a")
        expect(normalizeKeyName("Mod-a", "key")).toBe("Ctrl-a")
    })

    it("normalizes Space and single-letter keys", () => {
        expect(normalizeKeyName("Space", "key")).toBe(" ")
        expect(normalizeKeyName("Shift-Space", "key")).toBe("Shift- ")
        expect(normalizeKeyName("A", "key")).toBe("a")
        expect(normalizeKeyName("Ctrl-A", "key")).toBe("Ctrl-a")
    })

    it("accepts cmd/meta/m and control aliases", () => {
        expect(normalizeKeyName("Cmd-z", "mac")).toBe("Meta-z")
        expect(normalizeKeyName("Meta-z", "win")).toBe("Meta-z")
        expect(normalizeKeyName("m-z", "key")).toBe("Meta-z")
        expect(normalizeKeyName("Control-c", "key")).toBe("Ctrl-c")
        expect(normalizeKeyName("c-c", "key")).toBe("Ctrl-c")
    })

    it("normalizes modifiers to Shift-Meta-Ctrl-Alt-key order", () => {
        expect(normalizeKeyName("Shift-Alt-Ctrl-Meta-x", "key")).toBe("Shift-Meta-Ctrl-Alt-x")
        expect(normalizeKeyName("Cmd-Shift-z", "mac")).toBe("Shift-Meta-z")
    })

    it("throws on unrecognized modifiers", () => {
        expect(() => normalizeKeyName("Super-x", "key")).toThrow(/Unrecognized modifier/)
    })
})

describe("modifiers", () => {
    it("prefixes active keyboard modifiers in fixed order", () => {
        let event = {
            altKey: true,
            ctrlKey: true,
            metaKey: false,
            shiftKey: true,
        } as KeyboardEvent
        expect(modifiers("a", event)).toBe("Shift-Ctrl-Alt-a")
    })

    it("returns the bare name when no modifiers are held", () => {
        let event = {
            altKey: false,
            ctrlKey: false,
            metaKey: false,
            shiftKey: false,
        } as KeyboardEvent
        expect(modifiers("Enter", event)).toBe("Enter")
    })
})

describe("defaultKeymap arrow chords", () => {
    it("binds Mod-ArrowLeft/Right to Alt-Arrow on mac so they do not collide with Cmd-Arrow line motion", () => {
        let left = KeyBinding.defaultKeymap.find((b) => b.spec.key == "Mod-ArrowLeft")
        let right = KeyBinding.defaultKeymap.find((b) => b.spec.key == "Mod-ArrowRight")
        expect(left?.spec.mac).toBe("Alt-ArrowLeft")
        expect(right?.spec.mac).toBe("Alt-ArrowRight")
        expect(left?.spec.shift).toBeTruthy()
        expect(right?.spec.shift).toBeTruthy()
        expect(normalizeKeyName(left!.spec.mac!, "mac")).toBe("Alt-ArrowLeft")
        expect(normalizeKeyName("Cmd-ArrowLeft", "mac")).toBe("Meta-ArrowLeft")
        expect(normalizeKeyName(left!.spec.mac!, "mac")).not.toBe(normalizeKeyName("Cmd-ArrowLeft", "mac"))
        expect(normalizeKeyName("Mod-ArrowLeft", "win")).toBe("Ctrl-ArrowLeft")
        expect(normalizeKeyName("Mod-ArrowLeft", "linux")).toBe("Ctrl-ArrowLeft")
    })

    it("keeps mac Cmd-ArrowLeft/Right as line-side with shift select", () => {
        let left = KeyBinding.defaultKeymap.find((b) => b.spec.mac == "Cmd-ArrowLeft")
        let right = KeyBinding.defaultKeymap.find((b) => b.spec.mac == "Cmd-ArrowRight")
        expect(left?.spec.key).toBeUndefined()
        expect(right?.spec.key).toBeUndefined()
        expect(left?.spec.shift).toBeTruthy()
        expect(right?.spec.shift).toBeTruthy()
    })
})

describe("mac Shift-Cmd-Arrow line select", () => {
    it.skipIf(!browser.mac)("Shift-Meta-ArrowLeft selects to mocked line start, not the previous word", () => {
        let doc = arrowDoc("hello world")
        let state = EditorState.create({
            doc,
            selection: EditorSelection.cursor(doc.length - 1),
        })
        let start = 1
        let end = doc.length - 1
        expect(state.selection.head).toBe(end)
        let editor = mockKeyEditor(state, (forward) => (forward ? end : start))
        let event = keyEvent("ArrowLeft", {meta: true, shift: true})
        expect(KeyBinding.runScopeHandlers(editor, event, "editor")).toBe(true)
        expect(editor.state.selection.from).toBe(start)
        expect(editor.state.selection.to).toBe(end)
        expect(editor.state.selection.empty).toBe(false)
    })

    it.skipIf(!browser.mac)("Shift-Meta-ArrowRight selects to mocked line end", () => {
        let doc = arrowDoc("hello world")
        let state = EditorState.create({
            doc,
            selection: EditorSelection.cursor(1),
        })
        let start = 1
        let end = doc.length - 1
        let editor = mockKeyEditor(state, (forward) => (forward ? end : start))
        let event = keyEvent("ArrowRight", {meta: true, shift: true})
        expect(KeyBinding.runScopeHandlers(editor, event, "editor")).toBe(true)
        expect(editor.state.selection.from).toBe(start)
        expect(editor.state.selection.to).toBe(end)
    })
})
