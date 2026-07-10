import {describe, expect, it} from "vitest"
import {Leaf} from "./leaf"
import {Plot} from "./plot"
import {TextOutput} from "./text"

describe("TextOutput", () => {
    let para = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let emoji = Leaf.Type.define<{name: string}>("emoji", {
        inline: true,
        defaultParam: {name: "smile"},
        toText: (node) => `:${(node.param as {name: string}).name}:`,
        shape: {element: "span"},
    })
    let hr = Leaf.define("hr", {
        shape: {element: "hr"},
        toText: () => "---",
    })

    it("appends text leaves", () => {
        let out = new TextOutput("\n")
        expect(out.serialize(Leaf.text("hello"))).toBe(true)
        expect(out.text).toBe("hello")
        expect(out.started).toBe(true)
    })

    it("uses toText for non-text leaves", () => {
        let out = new TextOutput("\n")
        expect(out.serialize(emoji.of({name: "wave"}))).toBe(true)
        expect(out.text).toBe(":wave:")
    })

    it("falls back to leafText when toText is absent", () => {
        let plain = Leaf.define("img", {inline: true, shape: {element: "img"}})
        let out = new TextOutput("\n", () => "[img]")
        expect(out.serialize(plain)).toBe(true)
        expect(out.text).toBe("[img]")
    })

    it("returns false for plots so callers can walk children", () => {
        let out = new TextOutput("\n")
        let p = para.create([Leaf.text("x")])
        expect(out.serialize(p)).toBe(false)
        // textblock opens a block (marks started) without emitting body text
        expect(out.started).toBe(true)
        expect(out.text).toBe("")
    })

    it("inserts blockSep between successive blocks", () => {
        let out = new TextOutput("\n")
        out.serialize(para.create([]))
        out.serialize(Leaf.text("a"))
        out.serialize(para.create([]))
        out.serialize(Leaf.text("b"))
        // first textblock openBlock, text "a", second textblock openBlock adds sep, text "b"
        expect(out.text).toBe("a\nb")
    })

    it("opens a block for block leaves that produce text", () => {
        let out = new TextOutput("|")
        out.serialize(hr)
        out.serialize(hr)
        expect(out.text).toBe("---|---")
    })

    it("openBlock alone can mark started without text", () => {
        let out = new TextOutput("\n")
        out.openBlock()
        expect(out.started).toBe(true)
        expect(out.text).toBe("")
        out.openBlock()
        expect(out.text).toBe("\n")
    })
})
