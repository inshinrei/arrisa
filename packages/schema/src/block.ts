/**
 * Block-level schema extensions.
 *
 * Registers document roots and block content from `@arrisa/types`, and attaches
 * editor chrome:
 * - menu buttons / submenus (block group or textblock style submenu)
 * - key bindings (set type, align, direction)
 * - input rules (`# ` headings, fenced code, `> ` quote, `---` rule)
 * - blockquote theme and text-direction integration via `textblockLTR`
 *
 * Types come from `@arrisa/types` (Paragraph, Heading, …);
 * this module only composes them into extensions.
 */
import {
    Command,
    Menu,
    setAlignment,
    setDirection,
    setTextblockType,
    toggleBlock,
} from "@arrisa/command"
import {ChangeSet, Leaf, Plot, type Pos} from "@arrisa/doc"
import {Arrisa, InputRule, KeyBinding} from "@arrisa/editor"
import {history} from "@arrisa/history"
import {phrases} from "@arrisa/phrases"
import {BidiSpan, EditorSelection, EditorState, type EditorState as ES} from "@arrisa/state"
import {
    Alignment,
    Blockquote,
    CodeBlock,
    CodeBlockLanguage,
    Direction,
    Doc,
    Heading,
    HorizontalRule,
    InlineDoc,
    Paragraph,
} from "@arrisa/types"

/** Block document root (`Doc`) — holds block content group. */
export function blockDoc(): EditorState.Extension {
    return EditorState.schemaElement.of(Doc)
}

/** Inline-only document root (`InlineDoc`) — e.g. single-line rich fields. */
export function inlineDoc(): EditorState.Extension {
    return EditorState.schemaElement.of(InlineDoc)
}

/** True when both ends of the selection sit in the same textblock of `tag`. */
function selectionInType(tag: Plot.Tag) {
    return (state: ES) => {
        let {sel} = state,
            block = sel.head.textblockParent
        return !!block && block.start == sel.anchor.textblockParent?.start && block.node.tag.eq(tag)
    }
}

/** Paragraph textblock: schema element, menu button, Ctrl-Shift-0. */
export function paragraph(): EditorState.Extension {
    return [EditorState.schemaElement.of(Paragraph), paragraph.button, paragraph.keyBinding]
}

export namespace paragraph {
    export const keyBinding = KeyBinding.of({
        key: "Ctrl-Shift-0",
        run: Command.bind(setTextblockType, Paragraph),
    })

    export const button = Menu.Button.define({
        run: Command.bind(setTextblockType, Paragraph),
        active: selectionInType(Paragraph),
        label: phrases.ref("paragraph"),
        parent: Menu.Submenu.textblockStyle,
        rank: 10,
    })
}

/**
 * Heading levels 1–6: menu buttons for H1–H3, key bindings Ctrl-Shift-1…6,
 * and a `#`…`###### ` input rule.
 */
export function heading(): EditorState.Extension {
    return [
        EditorState.schemaElement.of(Heading),
        heading.button1,
        heading.button2,
        heading.button3,
        heading.keyBindings,
        heading.createOnHash,
    ]
}

export namespace heading {
    function levelKey(level: number) {
        return KeyBinding.of({
            key: `Ctrl-Shift-${level}`,
            run: Command.bind(setTextblockType, Heading.of(level)),
        })
    }

    function levelButton(level: 1 | 2 | 3, phrase: "heading_1" | "heading_2" | "heading_3") {
        return Menu.Button.define({
            run: Command.bind(setTextblockType, Heading.of(level)),
            active: selectionInType(Heading.of(level)),
            label: phrases.ref(phrase),
            parent: Menu.Submenu.textblockStyle,
            rank: 49 + level,
        })
    }

    export const keyBindings = [1, 2, 3, 4, 5, 6].map(levelKey)

    export const button1 = levelButton(1, "heading_1")
    export const button2 = levelButton(2, "heading_2")
    export const button3 = levelButton(3, "heading_3")

    /** Markdown-style ATX headings: 1–6 `#` followed by a space. */
    export const createOnHash = InputRule.textblockType(
        /^(#{1,6}) $/,
        (m) => Heading.of(m[1]!.to.pos - m[1]!.from.pos),
        true,
    )
}

/**
 * Fenced code block: schema elements, button, Ctrl-Shift-\\, `` ``` `` / `` ```lang ``
 * input rule, and preformatted theme.
 */
export function codeBlock(): EditorState.Extension {
    return [
        EditorState.schemaElement.of(CodeBlock),
        EditorState.schemaElement.of(CodeBlockLanguage),
        codeBlock.button,
        codeBlock.keyBinding,
        codeBlock.createOnBackticks,
        codeBlock.theme,
    ]
}

export namespace codeBlock {
    export const keyBinding = KeyBinding.of({
        key: "Ctrl-Shift-\\",
        run: Command.bind(setTextblockType, CodeBlock),
    })

    export const button = Menu.Button.define({
        run: Command.bind(setTextblockType, CodeBlock),
        active: selectionInType(CodeBlock),
        label: phrases.ref("code_block"),
        parent: Menu.Submenu.textblockStyle,
        rank: 30,
    })

    /**
     * Markdown fence at start of a textblock, terminated by a space:
     * `` ``` `` or `` ```ts `` then space. Optional language → {@link CodeBlockLanguage}.
     * Space is required so `` ```ts `` is not cut short while the language is still being typed.
     */
    export const createOnBackticks = InputRule.textblockType(
        /^```([\w+#.-]*) $/,
        (m) => {
            let lang = m[1]?.text
            if (!lang) return CodeBlock
            return CodeBlock.withMarks(CodeBlockLanguage.of(lang).addToSet(CodeBlock.marks))
        },
        true,
    )

    export const theme: EditorState.Extension = Arrisa.theme({
        pre: {
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "0.9em",
            lineHeight: "1.45",
            marginBlock: "0.5em",
            marginInline: 0,
            padding: "10px 12px",
            borderRadius: "6px",
            overflowX: "auto",
            whiteSpace: "pre",
            backgroundColor: "color-mix(in srgb, currentColor 8%, transparent)",
            border: "1px solid color-mix(in srgb, currentColor 12%, transparent)",
        },
        "pre code": {
            fontFamily: "inherit",
            fontSize: "inherit",
            background: "none",
            padding: 0,
            border: "none",
            borderRadius: 0,
        },
    })
}

/** Text alignment mark on textblocks: start / end / center submenu + shortcuts. */
export function alignment(): EditorState.Extension {
    return [EditorState.schemaElement.of(Alignment), alignment.button, alignment.keyBindings]
}

function alignmentAtCursor(state: ES): null | "end" | "center" {
    let block = state.sel.head.textblockParent
    return (block && block.node.tag.mark(Alignment)) || null
}

export namespace alignment {
    export const keyBindings = [
        KeyBinding.of({key: "Mod-Shift-l", run: Command.bind(setAlignment, "left")}),
        KeyBinding.of({key: "Mod-Shift-r", run: Command.bind(setAlignment, "right")}),
        KeyBinding.of({key: "Mod-Shift-e", run: Command.bind(setAlignment, "center")}),
    ]

    export const buttonStart = Menu.Button.define({
        run: Command.bind(setAlignment, null),
        active: (state) => alignmentAtCursor(state) == null,
        label: {
            icon: "M16 81a3 3 0 0 1 0-6h44a3 3 0 0 1 0 6h-44m0-19a3 3 0 0 1 0-6h69a3 3 0 0 1 0 6h-69m0-19a3 3 0 0 1 0-6h44a3 3 0 0 1 0 6h-44m0-19a3 3 0 0 1 0-6h69a3 3 0 0 1 0 6h-69",
            directional: true,
        },
        description: phrases.ref("align_start"),
    })

    export const buttonEnd = Menu.Button.define({
        run: Command.bind(setAlignment, "end"),
        active: (state) => alignmentAtCursor(state) == "end",
        label: {
            icon: "M41 81a3 3 0 0 1 0-6h44a3 3 0 0 1 0 6h-44m-25-19a3 3 0 0 1 0-6h69a3 3 0 0 1 0 6h-69m25-19a3 3 0 0 1 0-6h44a3 3 0 0 1 0 6h-44m-25-19a3 3 0 0 1 0-6h69a3 3 0 0 1 0 6h-69",
            directional: true,
        },
        description: phrases.ref("align_end"),
    })

    export const buttonCenter = Menu.Button.define({
        run: Command.bind(setAlignment, "center"),
        active: (state) => alignmentAtCursor(state) == "center",
        label: {
            icon: "M29 81a3 3 0 0 1 0-6h44a3 3 0 0 1 0 6h-44m-13-19a3 3 0 0 1 0-6h69a3 3 0 0 1 0 6h-69m13-19a3 3 0 0 1 0-6h44a3 3 0 0 1 0 6h-44m-13-19a3 3 0 0 1 0-6h69a3 3 0 0 1 0 6h-69",
        },
        description: phrases.ref("align_center"),
    })

    export const button = Menu.Submenu.define({
        description: phrases.ref("alignment"),
        parent: Menu.Group.block,
        arrow: false,
        rank: 10,
        content: [buttonStart, buttonEnd, buttonCenter],
    })
}

/**
 * Writing direction mark (`ltr` | `rtl` | `auto`) plus a `textblockLTR`
 * provider so layout respects per-block direction.
 */
export function direction(): EditorState.Extension {
    return [EditorState.schemaElement.of(Direction), direction.textblockDir, direction.button]
}

/** First strong bidi character in the textblock, or null. */
function autoDir(plot: Plot) {
    for (let ch of plot.content)
        if (ch.is(Leaf.Text)) {
            for (let i = 0; i < ch.param.length; i++) {
                let dir = BidiSpan.strongDir(ch.param.charCodeAt(i))
                if (dir != null) return dir
            }
        }
    return null
}

function directionAtCursor(state: ES): "ltr" | "rtl" | "auto" {
    let block = state.sel.head.textblockParent
    return (block && block.node.mark(Direction)) || (state.textLTR ? "ltr" : "rtl")
}

export namespace direction {
    /** Resolves `auto` via bidi strong direction; explicit ltr/rtl map to boolean. */
    export const textblockDir: EditorState.Extension = EditorState.textblockLTR.of((plot) => {
        let dir = plot.mark(Direction)
        return !dir ? null : dir == "auto" ? autoDir(plot) : dir == "ltr"
    })

    export const buttonLTR = Menu.Button.define({
        run: Command.bind(setDirection, "ltr"),
        active: (state) => directionAtCursor(state) == "ltr",
        label: {
            icon: "M70 35l20 15l-20 15l0-30M45 83v-63h-5v63a3 3 0 0 1-6 0v-28h-4a20 20 0 1 1 0-40h28a3 3 0 0 1 0 6h-7v62a3 3 0 0 1-6 0",
        },
        description: phrases.ref("text_dir_ltr"),
    })

    export const buttonRTL = Menu.Button.define({
        run: Command.bind(setDirection, "rtl"),
        active: (state) => directionAtCursor(state) == "rtl",
        label: {
            icon: "M30 35l-20 15l20 15l0-30M75 83v-63h-5v63a3 3 0 0 1-6 0v-28h-4a20 20 0 1 1 0-40h28a3 3 0 0 1 0 6h-7v62a3 3 0 0 1-6 0",
        },
        description: phrases.ref("text_dir_rtl"),
    })

    export const buttonAuto = Menu.Button.define({
        run: Command.bind(setDirection, "auto"),
        active: (state) => directionAtCursor(state) == "auto",
        label: {
            icon: "M35 30l-23 20l23 20l0-40M60 30l23 20l-23 20l0-40",
        },
        description: phrases.ref("text_dir_auto"),
    })

    export const button = Menu.Submenu.define({
        description: phrases.ref("text_dir"),
        parent: Menu.Group.block,
        arrow: false,
        rank: 20,
        content: [buttonLTR, buttonRTL, buttonAuto],
    })
}

/** Nested blockquote: toggle wrap, `> ` input rule, and left-border theme. */
export function blockquote(): EditorState.Extension {
    return [EditorState.schemaElement.of(Blockquote), blockquote.button, blockquote.createOnGT, blockquote.theme]
}

export namespace blockquote {
    export const button = Menu.Button.define({
        run: Command.bind(toggleBlock, Blockquote),
        active: (state) => {
            for (let cur: Pos.Node | null = state.sel.head.parent; cur; cur = cur.parent)
                if (cur.node.type == Blockquote.type) return true
            return false
        },
        label: {
            icon: "M75 75a6 6 0 0 0 6-6V53a6 6 0 0 0-6-6h-9q0-3 0-7 1-3 2-6t3-4q2-2 5-2V19q-5 0-9 2a21 21 0 0 0-7 6 31 31 0 0 0-4 9A48 48 0 0 0 56 47V69a5 5 0 0 0 6 6zm-37 0a6 6 0 0 0 6-6V53a6 6 0 0 0-6-6H29q0-3 0-7 1-3 2-6 1-3 3-4 2-2 5-2V19q-5 0-9 2a21 21 0 0 0-7 6 31 31 0 0 0-4 9A48 48 0 0 0 19 47V69a6 6 0 0 0 6 6z",
        },
        description: phrases.ref("toggle_quote"),
        parent: Menu.Group.block,
        rank: 40,
    })

    export const createOnGT = InputRule.wrapping(/^> $/, Blockquote, true)

    export const theme: EditorState.Extension = Arrisa.theme({
        blockquote: {
            marginInline: "3px",
            paddingInlineStart: "12px",
            borderInlineStart: "4px solid silver",
        },
    })
}

/** Horizontal rule leaf; `---` at start of empty textblock inserts an HR. */
export function horizontalRule(): EditorState.Extension {
    return [EditorState.schemaElement.of(HorizontalRule), horizontalRule.createOnDashes]
}

export namespace horizontalRule {
    /** Isolated history step so the HR insert does not join with typing. */
    export const createOnDashes = InputRule.define({
        expr: /^---$/,
        lookahead: /^$/,
        apply: (state, m) => {
            let changes = ChangeSet.create(state.doc, {
                from: m[0].from.pos,
                to: m[0].to.pos,
                insert: [HorizontalRule],
                fit: true,
            })
            let hr = changes.findInserted((t) => t == HorizontalRule)
            if (hr == null) return null
            return {
                changes,
                selection: (cx) => EditorSelection.near(cx, hr + 1, 1),
                annotations: history.isolate.of("full"),
                userEvent: "insert.horizontalrule",
            }
        },
    })
}
