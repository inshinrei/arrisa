/**
 * Core block content: paragraphs, headings, code blocks, blockquotes, rules.
 */
import {Plot, Leaf, Mark, Node, Elt, ValidationError} from "@arrisa/doc"

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

/** Fenced / preformatted code block (`pre`). Role {@link Node.Role.Code}. */
export const CodeBlock = Plot.define("CodeBlock", {
    inlineContent: true,
    group: G.Content,
    role: Node.Role.Code,
    shape: {element: "pre"},
})

/**
 * Optional language tag on a {@link CodeBlock} (`data-language` attribute).
 * String param is the language identifier (e.g. `"ts"`, `"python"`).
 */
export const CodeBlockLanguage = Mark.Type.define<string>("CodeBlockLanguage", {
    target: CodeBlock,
    validate: "string",
    shape: {attribute: "data-language", value: 0},
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
