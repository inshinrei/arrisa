/**
 * Inline text marks, link/code, colors, and block alignment / direction.
 */
import {Mark, Node, ValidationError, parse} from "@arrisa/doc"
import {sanitizeCssColor} from "../css-color"
import {sanitizeLinkHref} from "../safe-url"
import {Figure} from "./media"

const G = Node.Group

/**
 * Horizontal text alignment on textblocks and figures (`text-align: end | center`).
 * Kept across split and type change. Left/start is the unmarked default.
 */
export const Alignment = Mark.Type.define<"end" | "center">("Alignment", {
    target: [G.Textblock, Figure],
    keepOnSplit: true,
    keepOnTypeChange: true,
    shape: {attribute: "style", value: (align: "end" | "center") => `text-align: ${align}`},
    parseRules: [
        {
            attribute: "style/text-align",
            readAttribute: (value: string) => (/^(end|center)$/.test(value) ? (value as any) : parse.Reject),
        },
    ],
})

/**
 * Writing direction on textblocks (`dir`: `ltr` | `rtl` | `auto`).
 * Kept across split and type change.
 */
export const Direction = Mark.Type.define<"ltr" | "rtl" | "auto">("Direction", {
    target: G.Textblock,
    keepOnSplit: true,
    keepOnTypeChange: true,
    validate: (val) => {
        if (val != "ltr" && val != "rtl" && val != "auto") throw new ValidationError(`Invalid direction value: ${val}`)
    },
    shape: {attribute: "dir", value: 0},
})

/**
 * Italic emphasis (`em`). Also matches `font-style: italic`;
 * `font-style: normal` clears this mark on parse.
 */
export const Emphasis = Mark.define("Emphasis", {
    rank: 50,
    shape: {element: "em"},
    parseRules: [
        {attribute: "style/font-style", value: "italic"},
        {attribute: "style/font-style", value: "normal", clearMark: (p: Mark) => p.name == "Emphasis"},
    ],
})

/**
 * Strong / bold (`strong`). Matches bold-ish `font-weight` values;
 * normal/lighter weights clear this mark on parse.
 */
export const Strong = Mark.define("Strong", {
    rank: 60,
    shape: {element: "strong"},
    parseRules: [
        {
            attribute: "style/font-weight",
            readAttribute: (value: string) => (/^(bold(er)?|[5-9]\d{2,})$/.test(value) ? null : parse.Reject),
        },
        {
            attribute: "style/font-weight",
            readAttribute: (value: string) => (/^(normal|lighter|[1-4]\d{2})$/.test(value) ? null : parse.Reject),
            clearMark: (p: Mark) => p.name == "Strong",
        },
    ],
})

/** Underline (`u`); also matches `text-decoration: underline`. */
export const Underline = Mark.define("Underline", {
    rank: 40,
    shape: {element: "u"},
    parseRules: [{attribute: "style/text-decoration", value: "underline"}],
})

/** Strikethrough (`s`); also matches `text-decoration: line-through`. */
export const Strikethrough = Mark.define("Strikethrough", {
    rank: 42,
    shape: {element: "s"},
    parseRules: [{attribute: "style/text-decoration", value: "line-through"}],
})

/**
 * Spoiler / hidden text (`span.arrisa-spoiler`).
 * Also matches `span.spoiler` and `data-entity-type` spoiler attributes on parse.
 */
export const Spoiler = Mark.define("Spoiler", {
    rank: 36,
    shape: {
        element: "span",
        attributes: {
            class: "arrisa-spoiler",
            "data-entity-type": "spoiler",
        },
    },
    parseRules: [
        {selector: "span.arrisa-spoiler"},
        {selector: "span.spoiler"},
        {selector: "span[data-entity-type=spoiler]"},
    ],
})

/** Superscript (`sup`). */
export const Superscript = Mark.define("Superscript", {
    rank: 45,
    shape: {element: "sup"},
})

/** Subscript (`sub`). */
export const Subscript = Mark.define("Subscript", {
    rank: 47,
    shape: {element: "sub"},
})

/**
 * Hyperlink (`a[href]`). Param is a scheme-checked URL string.
 * Non-inclusive so typing at the end does not extend the link.
 * Unsafe schemes (`javascript:`, `data:`, …) are rejected on validate and parse.
 */
export const Link = Mark.Type.define<string>("Link", {
    rank: 20,
    validate: (val) => {
        if (typeof val != "string" || sanitizeLinkHref(val) == null)
            throw new ValidationError(`Invalid link href: ${val}`)
    },
    inclusive: false,
    shape: {
        element: "a",
        preferTarget: "a[href]",
        attributes: (href: string) => ({href}),
    },
    parseRules: [
        {
            selector: "a[href]",
            readElement: (dom: Element) => {
                let href = dom.getAttribute("href") || ""
                let safe = sanitizeLinkHref(href, {allowRelative: true})
                return safe == null ? parse.Reject : safe
            },
        },
    ],
})

/** Inline code span (`code`). */
export const Code = Mark.define("Code", {
    rank: 80,
    shape: {element: "code"},
})

/** Text color (`style/color`). Spanning mark; param is a validated CSS color string. */
export const Color = Mark.Type.define<string>("Color", {
    rank: 30,
    validate: (val) => {
        if (typeof val != "string" || sanitizeCssColor(val) == null)
            throw new ValidationError(`Invalid color: ${val}`)
    },
    shape: {attribute: "style/color", value: 0},
    spanning: true,
    parseRules: [
        {
            attribute: "style/color",
            readAttribute: (value: string) => {
                let safe = sanitizeCssColor(value)
                return safe == null ? parse.Reject : safe
            },
        },
    ],
})

/** Background color (`style/background-color`). Spanning mark; param is a validated CSS color string. */
export const BackgroundColor = Mark.Type.define<string>("BackgroundColor", {
    rank: 35,
    validate: (val) => {
        if (typeof val != "string" || sanitizeCssColor(val) == null)
            throw new ValidationError(`Invalid background color: ${val}`)
    },
    shape: {attribute: "style/background-color", value: 0},
    spanning: true,
    parseRules: [
        {
            attribute: "style/background-color",
            readAttribute: (value: string) => {
                let safe = sanitizeCssColor(value)
                return safe == null ? parse.Reject : safe
            },
        },
    ],
})
