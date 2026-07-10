import {describe, expect, it} from "vitest"
import {SchemaError} from "../../util/error"
import {Mark} from "../mark"
import {Leaf} from "./leaf"
import {Plot} from "./plot"
import {NodeFlag} from "./flags"
import {flagsFor, joinText, markString, sliceContent} from "./utils"
import {Token} from "../token"

describe("NodeFlag", () => {
    it("uses distinct powers of two", () => {
        let values = [
            NodeFlag.None,
            NodeFlag.Inline,
            NodeFlag.InlineContent,
            NodeFlag.Atom,
            NodeFlag.Doc,
            NodeFlag.NullParam,
            NodeFlag.Selectable,
            NodeFlag.CanBeEmpty,
        ]
        expect(values).toEqual([0, 1, 2, 4, 8, 16, 32, 64])
        for (let i = 1; i < values.length; i++) {
            for (let j = 1; j < i; j++) {
                expect(values[i] & values[j]).toBe(0)
            }
        }
    })
})

describe("flagsFor", () => {
    it("defaults to no flags for a plain block leaf spec", () => {
        expect(flagsFor({shape: {element: "img"}})).toBe(NodeFlag.None)
    })

    it("sets Inline for inline specs", () => {
        expect(flagsFor({inline: true, shape: {element: "br"}})).toBe(NodeFlag.Inline)
    })

    it("sets InlineContent and CanBeEmpty for inline content plots", () => {
        expect(flagsFor({inlineContent: true, shape: {element: "p"}})).toBe(
            NodeFlag.InlineContent | NodeFlag.CanBeEmpty,
        )
    })

    it("sets CanBeEmpty when canBeEmpty is true", () => {
        expect(flagsFor({blockContent: true as any, canBeEmpty: true, shape: {element: "div"}})).toBe(
            NodeFlag.CanBeEmpty,
        )
    })

    it("sets Selectable for selectable leaf specs", () => {
        expect(flagsFor({selectable: true, shape: {element: "img"}})).toBe(NodeFlag.Selectable)
    })

    it("throws when both block and inline content are specified", () => {
        expect(() =>
            flagsFor({
                inlineContent: true,
                blockContent: true as any,
                shape: {element: "div"},
            }),
        ).toThrow(SchemaError)
    })
})

describe("markString", () => {
    let bold = Mark.define("bold", {shape: {element: "strong"}})
    let link = Mark.Type.define<string>("link", {
        shape: {attribute: "href", value: 0},
    })

    it("returns empty string for no marks", () => {
        expect(markString(Mark.none)).toBe("")
    })

    it("prints default flag marks by name only", () => {
        expect(markString([bold])).toBe("[bold]")
    })

    it("JSON-stringifies valued marks", () => {
        let marks = link.of("https://x.com").addToSet(Mark.none)
        expect(markString(marks)).toBe('[link="https://x.com"]')
    })

    it("joins multiple marks", () => {
        let marks = link.of("/a").addToSet([bold])
        expect(markString(marks)).toMatch(/^\[/)
        expect(markString(marks)).toContain("bold")
        expect(markString(marks)).toContain('link="/a"')
    })
})

describe("joinText", () => {
    let bold = Mark.define("bold", {shape: {element: "strong"}})
    let para = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})

    it("returns empty and block-leading content unchanged", () => {
        expect(joinText([])).toEqual([])
        let block = para.create([Leaf.text("a")])
        let nodes = [block, Leaf.text("x")]
        expect(joinText(nodes)).toBe(nodes)
    })

    it("merges adjacent text with the same marks", () => {
        let a = Leaf.text("hel")
        let b = Leaf.text("lo")
        let joined = joinText([a, b])
        expect(joined.length).toBe(1)
        expect(joined[0].is(Leaf.Text) && joined[0].param).toBe("hello")
    })

    it("does not merge text with different marks", () => {
        let a = Leaf.text("a")
        let b = Leaf.text("b", [bold])
        let joined = joinText([a, b])
        expect(joined.length).toBe(2)
        expect(joined[0]).toBe(a)
        expect(joined[1]).toBe(b)
    })

    it("does not merge text separated by a non-text leaf", () => {
        let br = Leaf.define("br", {inline: true, shape: {element: "br"}})
        let joined = joinText([Leaf.text("a"), br, Leaf.text("b")])
        expect(joined.length).toBe(3)
        expect((joined[0] as Leaf<string>).param).toBe("a")
        expect(joined[1]).toBe(br)
        expect((joined[2] as Leaf<string>).param).toBe("b")
    })

    it("returns the original array when no merge is needed", () => {
        let nodes = [Leaf.text("only")]
        expect(joinText(nodes)).toBe(nodes)
    })
})

describe("sliceContent", () => {
    let para = Plot.define("paragraph", {inlineContent: true, shape: {element: "p"}})
    let br = Leaf.define("br", {inline: true, shape: {element: "br"}})

    it("emits nothing for an empty range", () => {
        let out: any[] = []
        sliceContent(out, [Leaf.text("abc")], 1, 1)
        expect(out).toEqual([])
    })

    it("slices text leaves by range", () => {
        let out: any[] = []
        sliceContent(out, [Leaf.text("hello")], 1, 4)
        expect(out.length).toBe(1)
        expect(out[0].is(Leaf.Text) && out[0].param).toBe("ell")
    })

    it("emits whole non-text leaves when the range overlaps", () => {
        let out: any[] = []
        // "a" (1) + br (1) + "b" (1) — content offsets 0..3
        sliceContent(out, [Leaf.text("a"), br, Leaf.text("b")], 1, 2)
        expect(out.length).toBe(1)
        expect(out[0]).toBe(br)
    })

    it("opens and closes nested plots for partial ranges", () => {
        let inner = para.create([Leaf.text("xy")])
        // plot length = 2 + 2 = 4 (open, x, y, close); content offset of plot is 0
        let out: any[] = []
        sliceContent(out, [inner], 0, 3)
        // from 0,to 3 relative to content start of parent: open + "xy" without close? 
        // child slicePlot(from=0,to=3): from<=0, to=3 < length 4 → push tag, slice content  -1..2, no End
        expect(out[0]).toBe(para)
        expect(out[1].is(Leaf.Text) && out[1].param).toBe("xy")
        expect(out.some((t) => t == Plot.End || t == Token.End)).toBe(false)
    })

    it("emits full nested plots when fully covered", () => {
        let inner = para.create([Leaf.text("xy")])
        let out: any[] = []
        sliceContent(out, [inner], 0, inner.length)
        expect(out.length).toBe(1)
        expect(out[0]).toBe(inner)
    })
})
