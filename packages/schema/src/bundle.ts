/**
 * Composed schema presets and mark bundles.
 *
 * Factories here only **assemble** extensions from domain modules (`block`,
 * `mark`, `list`, `image`, …). They do not define schema elements themselves.
 *
 * | Preset | Typical use |
 * |--------|-------------|
 * | {@link basicSchema} | Document editor: doc root, paragraph/heading, basic marks |
 * | {@link inlineSchema} | Single-line / rich field: inline doc, marks, image |
 * | {@link composeSchema} | Block chat field: doc, lists, quote, code, compose marks |
 * | {@link messengerSchema} | Chat compose: inline doc + messenger format marks (spoiler) |
 * | {@link fullSchema} | Full rich text: blocks, lists, marks, media, resize |
 *
 * Mark bundles:
 * - {@link basicMarks} — strong, emphasis, link
 * - {@link composeMarks} — strong, em, underline, strike, code, link, clear-formatting
 * - {@link messengerMarks} — spoiler, strong, em, underline, strike, code, link
 * - {@link inlineMarks} — basic + code, underline, strike, super/sub, colors
 */
import {markExclusivity} from "@arrisa/command"
import {EditorState} from "@arrisa/state"
import {Code, LineBreak, Strikethrough} from "@arrisa/types"
import {
    alignment,
    blockDoc,
    blockquote,
    codeBlock,
    direction,
    heading,
    horizontalRule,
    inlineDoc,
    paragraph,
} from "./block"
import {clearFormattingButton} from "./clear-formatting"
import {backgroundColor, color} from "./color"
import {figure, image, imageResizing} from "./image"
import {link, type LinkConfig} from "./link"
import {bulletList, orderedList} from "./list"
import {code, emphasis, spoiler, strikethrough, strong, subscript, superscript, underline} from "./mark"

/** Hard line-break leaf (`br`) as a schema element. */
export function lineBreak(): EditorState.Extension {
    return EditorState.schemaElement.of(LineBreak)
}

/** Minimal inline marks: strong, emphasis, and link. */
export function basicMarks(): EditorState.Extension {
    return [strong(), emphasis(), link()]
}

/**
 * Compose-field marks: bold, italic, underline, strikethrough, monospace
 * (code), and link, plus {@link clearFormattingButton}. No spoiler.
 *
 * `config.link` is forwarded to {@link link}.
 */
export function composeMarks(config?: {link?: ComposeSchemaConfig["link"]}): EditorState.Extension {
    return [strong(), emphasis(), underline(), strikethrough(), code(), link(config?.link), clearFormattingButton]
}

/**
 * Messenger chat marks: spoiler, bold, italic, underline, strikethrough,
 * monospace (code), and link.
 */
export function messengerMarks(): EditorState.Extension {
    return [spoiler(), strong(), emphasis(), underline(), strikethrough(), code(), link()]
}

/**
 * Full inline mark set: {@link basicMarks} plus code, underline, strikethrough,
 * spoiler, super/subscript, and text/background color.
 */
export function inlineMarks(): EditorState.Extension {
    return [
        basicMarks(),
        code(),
        underline(),
        strikethrough(),
        spoiler(),
        superscript(),
        subscript(),
        color(),
        backgroundColor(),
    ]
}

/**
 * Lightweight block document: {@link Doc} root, paragraphs, headings, line
 * breaks, and {@link basicMarks}.
 */
export function basicSchema(): EditorState.Extension {
    return [blockDoc(), basicMarks(), paragraph(), heading(), lineBreak()]
}

/**
 * Inline-only document (e.g. title field): {@link InlineDoc}, basic marks,
 * inline images, and line breaks.
 */
export function inlineSchema(): EditorState.Extension {
    return [inlineDoc(), basicMarks(), image(), lineBreak()]
}

export interface MessengerSchemaConfig {
    /**
     * Mark exclusivity policy.
     * - `"none"` (default): free stacking
     * - `"code-strike"`: monospace + strikethrough isolate from other marks
     * - custom `{isolating: …}` for {@link markExclusivity}
     */
    exclusivity?: "none" | "code-strike" | {isolating: readonly import("@arrisa/doc").Mark.Type[]}
    /**
     * When true, use a block {@link Doc} with paragraphs and fenced code blocks
     * (`CodeBlock` + language mark, menu, `` ```lang `` input rule, theme).
     * Enables FormattedText `pre` import/export and markdown fence paste.
     * Default false keeps the single-stream {@link InlineDoc}.
     */
    codeBlocks?: boolean
}

/**
 * Messenger chat compose: format marks + line breaks.
 * - Default: {@link InlineDoc} (single inline stream).
 * - {@link MessengerSchemaConfig.codeBlocks}: block {@link Doc}, paragraphs,
 *   and {@link codeBlock} chrome (no headings/lists/media — use {@link fullSchema}).
 */
export function messengerSchema(config: MessengerSchemaConfig = {}): EditorState.Extension {
    let root: EditorState.Extension = config.codeBlocks
        ? [blockDoc(), paragraph(), codeBlock()]
        : inlineDoc()
    let ext: EditorState.Extension[] = [root, messengerMarks(), lineBreak()]
    let excl = config.exclusivity ?? "none"
    if (excl === "code-strike") {
        ext.push(markExclusivity({isolating: [Code, Strikethrough]}))
    } else if (excl !== "none" && typeof excl === "object") {
        ext.push(markExclusivity(excl))
    }
    return ext
}

export interface ComposeSchemaConfig {
    /**
     * Mark exclusivity policy. Same values as {@link MessengerSchemaConfig.exclusivity}.
     */
    exclusivity?: MessengerSchemaConfig["exclusivity"]
    /** Options forwarded to {@link link} (`prompt` default `"floating"`). */
    link?: LinkConfig
}

/**
 * Block chat compose: {@link Doc} root, paragraphs, {@link composeMarks},
 * lists, quotes, and fenced code blocks. No spoiler, headings, media, or
 * alignment. {@link messengerSchema} remains the inline/spoiler path.
 */
export function composeSchema(config: ComposeSchemaConfig = {}): EditorState.Extension {
    let ext: EditorState.Extension[] = [
        blockDoc(),
        paragraph(),
        composeMarks({link: config.link}),
        lineBreak(),
        bulletList(),
        orderedList(),
        blockquote(),
        codeBlock(),
    ]
    let excl = config.exclusivity ?? "none"
    if (excl === "code-strike") {
        ext.push(markExclusivity({isolating: [Code, Strikethrough]}))
    } else if (excl !== "none" && typeof excl === "object") {
        ext.push(markExclusivity(excl))
    }
    return ext
}

/**
 * Full rich-text document: blocks, lists, quotes, HR, all inline marks,
 * images/figures, and image resizing.
 */
export function fullSchema(): EditorState.Extension {
    return [
        blockDoc(),
        paragraph(),
        heading(),
        lineBreak(),
        codeBlock(),
        alignment(),
        direction(),
        blockquote(),
        horizontalRule(),
        bulletList(),
        orderedList(),
        inlineMarks(),
        image(),
        figure(),
        imageResizing(),
    ]
}
