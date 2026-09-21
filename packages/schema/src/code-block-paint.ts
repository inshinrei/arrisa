/**
 * Paint fenced code-block tokens as range decorations.
 * Spans stay a view: inline code marks are not painted, and the dump is unchanged.
 */
import {Leaf, Node, type Plot} from "@arrisa/doc"
import {Arrisa, Decoration, RangeSet} from "@arrisa/editor"
import {EditorState} from "@arrisa/state"
import {CodeBlockLanguage} from "@arrisa/types"
import {highlightCode, type CodeRole, type CodeSpan} from "./highlight-code"

export const codeBlockHighlighter = EditorState.Facet.define<
    (text: string, language?: string) => CodeSpan[],
    (text: string, language?: string) => CodeSpan[]
>({
    combine: (fns) => (fns.length ? fns[fns.length - 1]! : highlightCode),
})

type CachedBlock = {
    text: string
    language: string
    spans: CodeSpan[]
}

type PaintState = {
    deco: RangeSet<Decoration.Range>
    blocks: readonly CachedBlock[]
}

type FlatBlock = {
    text: string
    language: string
    /** Doc position of each string index, plus one past the end. */
    starts: number[]
}

const tokenColor = (name: string) => `var(--arrisa-code-${name}, var(--arrisa-code-${name}-default, currentColor))`

const roleRule = (name: string, extra?: {fontWeight?: string; fontStyle?: string}) => {
    let rule: {[key: string]: string} = {color: tokenColor(name)}
    if (extra?.fontWeight) rule.fontWeight = extra.fontWeight
    if (extra?.fontStyle) rule.fontStyle = extra.fontStyle
    return rule
}

const ROLES: readonly {role: CodeRole; color: string; fontWeight?: string; fontStyle?: string}[] = [
    {role: "kw-flow", color: "violet", fontWeight: "700"},
    {role: "kw-decl", color: "indigo", fontWeight: "700"},
    {role: "modifier", color: "lavender", fontWeight: "700"},
    {role: "type", color: "sky"},
    {role: "function", color: "blue"},
    {role: "property", color: "cyan"},
    {role: "string", color: "green"},
    {role: "interpolation", color: "lime"},
    {role: "escape", color: "mint", fontWeight: "700"},
    {role: "number", color: "peach"},
    {role: "constant", color: "orange"},
    {role: "comment", color: "seagreen", fontStyle: "italic"},
    {role: "directive", color: "coral"},
    {role: "tag", color: "red"},
    {role: "attribute", color: "yellow"},
    {role: "regex", color: "pink"},
]

function tokenThemeSpec(): {[selector: string]: {[prop: string]: string}} {
    let spec: {[selector: string]: {[prop: string]: string}} = {}
    for (let role of ROLES) {
        spec[".arrisa-tok-" + role.role] = roleRule(role.color, {
            fontWeight: role.fontWeight,
            fontStyle: role.fontStyle,
        })
    }
    spec[".arrisa-tok-bold"] = {fontWeight: "700", fontStyle: "normal"}
    spec["&light"] = {
        "--arrisa-code-violet-default": "#7042ac",
        "--arrisa-code-indigo-default": "#4c47c8",
        "--arrisa-code-lavender-default": "#6d5292",
        "--arrisa-code-sky-default": "#2b6d94",
        "--arrisa-code-blue-default": "#205ec2",
        "--arrisa-code-cyan-default": "#097f94",
        "--arrisa-code-green-default": "#1c8022",
        "--arrisa-code-lime-default": "#5b841d",
        "--arrisa-code-mint-default": "#1e7d70",
        "--arrisa-code-peach-default": "#be6116",
        "--arrisa-code-orange-default": "#c84900",
        "--arrisa-code-seagreen-default": "#0f815b",
        "--arrisa-code-coral-default": "#a53848",
        "--arrisa-code-red-default": "#c43131",
        "--arrisa-code-yellow-default": "#987202",
        "--arrisa-code-pink-default": "#a22a60",
    }
    spec["&dark"] = {
        "--arrisa-code-violet-default": "#b884ff",
        "--arrisa-code-indigo-default": "#8e89ff",
        "--arrisa-code-lavender-default": "#d3b2ff",
        "--arrisa-code-sky-default": "#9edbff",
        "--arrisa-code-blue-default": "#629fff",
        "--arrisa-code-cyan-default": "#22ceec",
        "--arrisa-code-green-default": "#43cc4c",
        "--arrisa-code-lime-default": "#c3f07f",
        "--arrisa-code-mint-default": "#7beadb",
        "--arrisa-code-peach-default": "#ffb980",
        "--arrisa-code-orange-default": "#f68e42",
        "--arrisa-code-seagreen-default": "#42d7a5",
        "--arrisa-code-coral-default": "#fea4a4",
        "--arrisa-code-red-default": "#ff6464",
        "--arrisa-code-yellow-default": "#ffd65c",
        "--arrisa-code-pink-default": "#ffbfdc",
    }
    return spec
}

const codeTokenTheme = Arrisa.theme(tokenThemeSpec())

function blockLanguage(block: Plot): string {
    let marked = block.tag.mark(CodeBlockLanguage)
    return typeof marked == "string" && marked ? marked : ""
}

function appendMapped(text: string, pos: number, length: number, parts: string[], starts: number[]) {
    if (!text) return
    if (text.length == length) {
        for (let i = 0; i < text.length; i++) starts.push(pos + i)
    } else {
        for (let i = 0; i < text.length; i++) {
            let off = length > 0 ? Math.min(length - 1, Math.floor((i * length) / text.length)) : 0
            starts.push(pos + off)
        }
    }
    parts.push(text)
}

function flattenCodeBlock(block: Plot, pos: number): FlatBlock {
    let parts: string[] = []
    let starts: number[] = []
    let childPos = pos + 1
    for (let child of block.content) {
        if (child.is(Leaf.Text)) {
            appendMapped(child.param, childPos, child.length, parts, starts)
        } else if (child.isLeaf) {
            let toText = child.type.spec.toText
            appendMapped(toText ? toText(child) : "", childPos, child.length, parts, starts)
        }
        childPos += child.length
    }
    starts.push(childPos)
    return {text: parts.join(""), language: blockLanguage(block), starts}
}

function reuseSpans(
    prev: readonly CachedBlock[] | null,
    built: readonly CachedBlock[],
    index: number,
    text: string,
    language: string,
): CodeSpan[] | null {
    let at = prev?.[index]
    if (at && at.text == text && at.language == language) return at.spans
    if (prev) {
        for (let entry of prev) {
            if (entry.text == text && entry.language == language) return entry.spans
        }
    }
    for (let entry of built) {
        if (entry.text == text && entry.language == language) return entry.spans
    }
    return null
}

function addTokenRanges(ranges: [number, number, Decoration.Range][], spans: CodeSpan[], starts: number[]) {
    let cursor = 0
    for (let span of spans) {
        if (span.from < 0 || span.to >= starts.length || span.from >= span.to) continue
        let from = starts[span.from]!
        let to = starts[span.to]!
        if (from >= to || from < cursor) continue
        let cls = "arrisa-tok arrisa-tok-" + span.role
        if (span.emphasis == "bold") cls += " arrisa-tok-bold"
        ranges.push([from, to, Decoration.Range.wrapper("span", {attributes: {class: cls}})])
        cursor = to
    }
}

function paintCodeBlocks(state: EditorState, prev: PaintState | null): PaintState {
    let blocks: CachedBlock[] = []
    let ranges: [number, number, Decoration.Range][] = []
    let highlight = state.facet(codeBlockHighlighter)
    let previous = prev ? prev.blocks : null
    state.doc.iterate((node, pos) => {
        if (!node.isPlot || !node.type.hasRole(Node.Role.Code)) return
        let flat = flattenCodeBlock(node, pos)
        let reused = reuseSpans(previous, blocks, blocks.length, flat.text, flat.language)
        let spans = reused ? reused : highlight(flat.text, flat.language || undefined)
        blocks.push({text: flat.text, language: flat.language, spans})
        addTokenRanges(ranges, spans, flat.starts)
        return false
    })
    let deco = ranges.length ? RangeSet.create(ranges) : RangeSet.empty
    return {deco, blocks}
}

export const codeBlockPaintField = EditorState.Field.define<PaintState>({
    create(state) {
        return paintCodeBlocks(state, null)
    },
    update(value, tr) {
        if (!tr.docChanged) return value
        return paintCodeBlocks(tr.state, value)
    },
    provide: (field) => Decoration.Range.source.of((state) => state.field(field).deco),
})

/** Field plus token theme. Included by `codeBlock()`; not a package export. */
export function codeBlockPainting(): EditorState.Extension {
    return [codeBlockPaintField, codeTokenTheme]
}
