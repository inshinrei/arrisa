/**
 * Core block content: paragraphs, headings, code blocks, blockquotes, rules.
 */
import {Plot, Leaf, Mark, Node, Elt, ValidationError, parse} from "@arrisa/doc"

const G = Node.Group

/** Paragraph textblock (`p`). Default block when inserting bare content. */
export const Paragraph = Plot.define("Paragraph", {
    inlineContent: true,
    group: G.Content,
    defaultBlock: true,
    shape: {element: "p"},
})

/**
 * Heading textblock (`h1`–`h6`).
 * Param is the level (integer 1–6); maps to the matching heading element.
 */
export const Heading = Plot.Type.define("Heading", {
    defaultParam: 1,
    validate: (value) => {
        if (typeof value != "number" || Math.floor(value) != value || value < 1 || value > 6)
            throw new ValidationError(`Invalid heading level: ${value}`)
    },
    inlineContent: true,
    group: G.Content,
    shape: {structure: (level) => Elt.mk("h" + level, [0]), atom: false},
    defining: true,
    parseRules: [
        {selector: "h1", param: 1},
        {selector: "h2", param: 2},
        {selector: "h3", param: 3},
        {selector: "h4", param: 4},
        {selector: "h5", param: 5},
        {selector: "h6", param: 6},
    ],
})

/**
 * Read a language id from a CSS class list (`language-ts`) or reject.
 * Shared by shape auto-parse and explicit attribute rules.
 */
function readLanguageClass(value: string): string | typeof parse.Reject {
    let m = /(?:^|\s)language-(\S+)/.exec(value)
    if (!m) return parse.Reject
    let lang = m[1]!.trim()
    return lang ? lang : parse.Reject
}

function readLanguageAttr(value: string): string | typeof parse.Reject {
    let lang = value.trim()
    return lang ? lang : parse.Reject
}

/**
 * Fenced / preformatted code block (`pre > code`).
 * Role {@link Node.Role.Code}; whitespace is preserved.
 * CommonMark-style HTML: content lives in the nested `code` element.
 */
export const CodeBlock = Plot.define("CodeBlock", {
    inlineContent: true,
    group: G.Content,
    role: Node.Role.Code,
    defining: true,
    shape: {structure: Elt.mk("pre", [Elt.mk("code", [0])]), atom: false},
    parseRules: [
        // Prefer pre>code so the inner code is content, not the inline Code mark.
        {selector: "pre", contentElement: "code", marksFrom: "code", precedence: 2},
        // Bare <pre> paste fallback.
        {selector: "pre", precedence: 1},
    ],
})

/**
 * Optional language tag on a {@link CodeBlock}.
 * Serialized as `class="language-<id>"` on the inner `code` element (CommonMark/GFM).
 * Also parses legacy `data-language` on the matched element.
 */
export const CodeBlockLanguage = Mark.Type.define<string>("CodeBlockLanguage", {
    target: CodeBlock,
    validate: (value) => {
        if (typeof value != "string" || !value.trim())
            throw new ValidationError(`Invalid code block language: ${value}`)
    },
    keepOnSplit: true,
    shape: {
        attribute: "class",
        value: (lang: string) => `language-${lang}`,
        preferTarget: "code",
        readAttribute: readLanguageClass,
    },
    parseRules: [
        // Legacy Arrisa HTML / non-class language tags.
        {attribute: "data-language", readAttribute: readLanguageAttr},
    ],
})

/** Nested blockquote (`blockquote`). Adjacent quotes auto-join. */
export const Blockquote = Plot.define("Blockquote", {
    blockContent: G.Content,
    group: G.Content,
    shape: {element: "blockquote"},
    autoJoin: true,
})

/** Horizontal rule leaf (`hr`). Selectable; text form is `---`. */
export const HorizontalRule = Leaf.define("HorizontalRule", {
    group: G.Content,
    shape: {element: "hr"},
    toText: () => "---",
    selectable: true,
})
