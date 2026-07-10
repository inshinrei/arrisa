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
 * | {@link messengerSchema} | Chat compose: inline doc + messenger format marks |
 * | {@link fullSchema} | Full rich text: blocks, lists, marks, media, resize |
 *
 * Mark bundles:
 * - {@link basicMarks} — strong, emphasis, link
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
import {backgroundColor, color} from "./color"
import {figure, image, imageResizing} from "./image"
import {link} from "./link"
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
}

/**
 * Messenger chat compose: {@link InlineDoc}, messenger format marks, line breaks.
 * Does not include headings, lists, colors, or media — use {@link fullSchema}
 * for a document editor.
 */
export function messengerSchema(config: MessengerSchemaConfig = {}): EditorState.Extension {
    let ext: EditorState.Extension[] = [inlineDoc(), messengerMarks(), lineBreak()]
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
