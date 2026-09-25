/**
 * Markdown-style input rules for messenger compose.
 *
 * Patterns (closing delimiter typed at end of match) come from
 * {@link MARKDOWN_INLINE_DELIMITERS}.
 */
import {Leaf, Mark, Node, type Pos} from "@arrisa/doc"
import {InputRule} from "@arrisa/editor"
import {EditorSelection, EditorState, Transaction} from "@arrisa/state"
import {CodeBlock, CodeBlockLanguage, LineBreak, Paragraph} from "@arrisa/types"
import {MARKDOWN_INLINE_DELIMITERS} from "./markdown-delimiters"

function markRule(expr: RegExp, mark: Mark): InputRule {
    return InputRule.define({
        expr,
        apply(_state, match) {
            let inner = match[1]
            if (!inner || !inner.text) return null
            let full = match[0]
            return {
                changes: {
                    from: full.from.pos,
                    to: full.to.pos,
                    insert: [Leaf.text(inner.text, mark.addToSet(Mark.none))],
                },
                // Clear stored marks so typing after the converted run is unmarked.
                selection: {anchor: full.from.pos + inner.text.length, marks: Mark.none},
                userEvent: "input.mark",
            }
        },
    })
}

const rules = MARKDOWN_INLINE_DELIMITERS.map((d) =>
    markRule(new RegExp(d.inputSource), d.mark),
)

/** `**bold**` → strong. */
export const markdownBold = rules[0]!

/** `__italic__` → emphasis. */
export const markdownItalic = rules[1]!

/** `~~strike~~` → strikethrough. */
export const markdownStrike = rules[2]!

/** `||spoiler||` → spoiler. */
export const markdownSpoiler = rules[3]!

/** `` `code` `` → inline code (no newlines). */
export const markdownCode = rules[4]!

function fenceChildren(body: string): Node[] {
    let lines = body.split("\n")
    let children: Node[] = []
    for (let i = 0; i < lines.length; i++) {
        if (i > 0) children.push(LineBreak)
        let line = lines[i]!
        if (line) children.push(Leaf.text(line))
    }
    return children
}

function replaceWithCode(
    state: EditorState,
    from: number,
    to: number,
    body: string,
    lang: string | undefined,
): Transaction.Spec | null {
    let parent = state.doc.resolve(from).parent
    if (!state.schema.canContain(parent.node.type, CodeBlock.type)) return null
    let tag = lang ? CodeBlock.withMarks(CodeBlockLanguage.of(lang).addToSet(CodeBlock.marks)) : CodeBlock
    return {
        changes: {from, to, insert: [tag.create(fenceChildren(body))]},
        selection: EditorSelection.cursor(from + 1 + body.length),
        userEvent: "input.codeblock",
    }
}

function childPos(parent: Pos.Plot, index: number) {
    let pos = parent.start
    for (let i = 0; i < index; i++) pos += parent.node.content[i]!.length
    return pos
}

/** Previous sibling paragraphs from an opening ``` / ```lang through this closer. */
function closeSiblingFence(state: EditorState, block: Pos.Plot): Transaction.Spec | null {
    let parent = block.parent
    if (!parent) return null
    let opener = -1
    let lang: string | undefined
    for (let i = block.index - 1; i >= 0; i--) {
        let sib = parent.node.content[i]!
        if (!sib.isPlot || sib.type != Paragraph.type) return null
        let open = /^```([\w+#.-]*)$/.exec(sib.textContent())
        if (!open) continue
        opener = i
        lang = open[1] || undefined
        break
    }
    if (opener < 0) return null
    let lines: string[] = []
    for (let i = opener + 1; i < block.index; i++) {
        let sib = parent.node.content[i]!
        lines.push(sib.isPlot ? sib.textContent() : "")
    }
    return replaceWithCode(state, childPos(parent, opener), block.pos + block.node.length, lines.join("\n"), lang)
}

/**
 * Closed fence → code block.
 * One line `` ```code``` ``, one paragraph with line breaks, or a closing
 * `` ``` `` paragraph after `` ``` `` / `` ```lang ``.
 * Null when the parent cannot contain a code block.
 */
export const markdownCodeBlock = InputRule.define({
    expr: /```$/,
    lookahead: /^$/,
    apply(state, match) {
        let block = match[0].from.textblockParent
        if (!block || !block.parent) return null
        let text = block.node.textContent()
        let one = /^```([^`\n]+)```$/.exec(text)
        if (one?.[1]) return replaceWithCode(state, block.pos, block.pos + block.node.length, one[1], undefined)
        let multi = /^```([\w+#.-]*)\n([\s\S]*?)\n```$/.exec(text)
        if (multi)
            return replaceWithCode(
                state,
                block.pos,
                block.pos + block.node.length,
                multi[2] ?? "",
                multi[1] || undefined,
            )
        if (text != "```") return null
        return closeSiblingFence(state, block)
    },
})

/** Fence rule, then delimiter rules. */
export function markdownInputRules(): EditorState.Extension {
    return [markdownCodeBlock.extension, ...rules.map((r) => r.extension)]
}
