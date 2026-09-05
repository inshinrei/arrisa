import {describe, expect, it} from "vitest"
import {KeyBinding, normalizeKeyName, modifiers} from "./key-map"

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
