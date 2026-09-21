import {describe, expect, it} from "vitest"
import {Attributes, Leaf, Slice, type Elt} from "@arrisa/doc"
import {Arrisa, Decoration, type RangeSet} from "@arrisa/editor"
import {EditorSelection, EditorState} from "@arrisa/state"
import {Code, CodeBlock, CodeBlockLanguage, LineBreak, Paragraph} from "@arrisa/types"
import {blockDoc, codeBlock, paragraph} from "./block"
import {codeBlockHighlighter, codeBlockPaintField} from "./code-block-paint"
import {highlightCode} from "./highlight-code"
import {code} from "./mark"
import {makeState} from "./test-helpers"

function wrapperClass(deco: Decoration.Range): string | null {
    if (!("elt" in deco)) return null
    let elt = (deco as {elt: Elt}).elt
    return Attributes.get(elt.attrs, "class")
}

function tokenSet(state: EditorState): RangeSet<Decoration.Range> {
    let sources = state.facet(Decoration.Range.source)
    for (let source of sources) {
        let set = source(state)
        for (let i = 0; i < set.length; i++) {
            if (wrapperClass(set.values[i]!)?.includes("arrisa-tok")) return set
        }
    }
    throw new Error("no token decorations")
}

function exactRange(set: RangeSet<Decoration.Range>, from: number, to: number): Decoration.Range | null {
    for (let i = 0; i < set.length; i++) {
        if (set.from[i] == from && set.to[i] == to) return set.values[i]!
    }
    return null
}

function anyCover(state: EditorState, pos: number): boolean {
    for (let source of state.facet(Decoration.Range.source)) {
        let set = source(state)
        for (let i = 0; i < set.length; i++) {
            if (set.from[i]! <= pos && pos < set.to[i]!) return true
        }
    }
    return false
}

function indexInDoc(state: EditorState, needle: string): number {
    let at = -1
    state.doc.iterate((node, pos) => {
        if (!node.isText || at >= 0) return
        let i = (node.param as string).indexOf(needle)
        if (i >= 0) at = pos + i
    })
    if (at < 0) throw new Error(`missing ${needle}`)
    return at
}

function tsBlock(text: string) {
    return CodeBlock.withMarks(CodeBlockLanguage.of("ts").addToSet(CodeBlock.marks)).create([Leaf.text(text)])
}

describe("code block paint", () => {
    it("wraps kw-flow tokens", () => {
        let text = "if (ok) return true"
        let extensions = [blockDoc(), paragraph(), codeBlock()]
        let proto = makeState(extensions)
        let doc = proto.schema.doc([tsBlock(text)])
        let state = makeState(extensions, {doc})
        expect(state.doc.textContent()).toContain(text)
        let from = indexInDoc(state, "if")
        let hit = exactRange(tokenSet(state), from, from + 2)
        expect(hit).toBeTruthy()
        expect(wrapperClass(hit!)).toBe("arrisa-tok arrisa-tok-kw-flow")
    })

    it("does not cover ===", () => {
        let text = "a === b"
        let extensions = [blockDoc(), paragraph(), codeBlock()]
        let proto = makeState(extensions)
        let state = makeState(extensions, {doc: proto.schema.doc([tsBlock(text)])})
        let from = indexInDoc(state, "===")
        expect(anyCover(state, from)).toBe(false)
        expect(anyCover(state, from + 1)).toBe(false)
        expect(anyCover(state, from + 2)).toBe(false)
    })

    it("reuses the decoration set when the doc does not change", () => {
        let calls = 0
        let extensions = [
            blockDoc(),
            paragraph(),
            codeBlock(),
            codeBlockHighlighter.of((text, language) => {
                calls++
                return highlightCode(text, language)
            }),
        ]
        let proto = makeState(extensions)
        let state = makeState(extensions, {doc: proto.schema.doc([tsBlock("if (ok) return true")])})
        expect(calls).toBe(1)
        let set = tokenSet(state)
        let next = state.update({selection: EditorSelection.cursor(1)}).state
        expect(next.doc).toBe(state.doc)
        expect(next.field(codeBlockPaintField)).toBe(state.field(codeBlockPaintField))
        expect(tokenSet(next)).toBe(set)
        expect(calls).toBe(1)
    })

    it("keeps the first block's span array when the second block changes", () => {
        let calls: string[] = []
        let extensions = [
            blockDoc(),
            paragraph(),
            codeBlock(),
            codeBlockHighlighter.of((text, language) => {
                calls.push(text)
                return highlightCode(text, language)
            }),
        ]
        let first = "if (ok) return true"
        let second = "let x = 1"
        let proto = makeState(extensions)
        let doc = proto.schema.doc([tsBlock(first), tsBlock(second)])
        let state = makeState(extensions, {doc})
        expect(calls).toEqual([first, second])
        let spans = state.field(codeBlockPaintField).blocks[0]!.spans
        let at = state.doc.content[0]!.length + 1
        let next = state.update({changes: {from: at, to: at, insert: Slice.of([Leaf.text("z")])}}).state
        expect(calls).toEqual([first, second, "z" + second])
        expect(next.field(codeBlockPaintField).blocks[0]!.text).toBe(first)
        expect(next.field(codeBlockPaintField).blocks[0]!.spans).toBe(spans)
        expect(next.field(codeBlockPaintField).blocks[1]!.text).toBe("z" + second)
    })

    it("puts hex only on scheme defaults", () => {
        let state = makeState([blockDoc(), paragraph(), codeBlock()])
        let rules = state.facet(Arrisa.styleModule).flatMap((mod) => mod.getRules().split("\n"))
        let joined = rules.join("\n")
        expect(joined).toContain("#7042ac")
        expect(joined).toContain("#b884ff")
        expect(joined).toContain("var(--arrisa-code-violet, var(--arrisa-code-violet-default, currentColor))")
        let flow = rules.find((rule) => rule.includes(".arrisa-tok-kw-flow"))
        expect(flow).toBeTruthy()
        expect(flow!).not.toContain("#7042ac")
        expect(flow!).not.toMatch(/#[0-9a-fA-F]{3,8}/)
        let commentAt = joined.indexOf(".arrisa-tok-comment")
        let boldAt = joined.indexOf(".arrisa-tok-bold")
        expect(commentAt).toBeGreaterThan(-1)
        expect(boldAt).toBeGreaterThan(commentAt)
    })

    it("does not paint inline code marks", () => {
        let extensions = [blockDoc(), paragraph(), codeBlock(), code()]
        let proto = makeState(extensions)
        let doc = proto.schema.doc([Paragraph.create([Leaf.text("if (ok) return true", [Code])])])
        let state = makeState(extensions, {doc})
        for (let source of state.facet(Decoration.Range.source)) {
            let set = source(state)
            for (let i = 0; i < set.length; i++) {
                expect(wrapperClass(set.values[i]!) ?? "").not.toContain("arrisa-tok")
            }
        }
    })

    it("maps a line break leaf before the next token", () => {
        let extensions = [blockDoc(), paragraph(), codeBlock(), EditorState.schemaElement.of(LineBreak)]
        let proto = makeState(extensions)
        let block = CodeBlock.withMarks(CodeBlockLanguage.of("ts").addToSet(CodeBlock.marks)).create([
            Leaf.text("if"),
            LineBreak,
            Leaf.text("return"),
        ])
        let state = makeState(extensions, {doc: proto.schema.doc([block])})
        let from = indexInDoc(state, "return")
        let hit = exactRange(tokenSet(state), from, from + "return".length)
        expect(wrapperClass(hit!)).toBe("arrisa-tok arrisa-tok-kw-flow")
    })
})
