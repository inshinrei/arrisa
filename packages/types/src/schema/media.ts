/**
 * Image and figure nodes, plus alt text / size marks.
 */
import {Plot, Leaf, Mark, Node, Elt, ValidationError, parse} from "@arrisa/doc"
import {sanitizeImageSrc} from "../safe-url"

const G = Node.Group

function validateImageSrc(val: unknown) {
    if (typeof val != "string" || sanitizeImageSrc(val) == null)
        throw new ValidationError(`Invalid image src: ${val}`)
}

function readImageSrc(elt: Element): string | typeof parse.Reject {
    let img = elt.tagName.toLowerCase() == "img" ? elt : elt.querySelector("img[src]")
    if (!img) return parse.Reject
    let src = img.getAttribute("src") || ""
    let safe = sanitizeImageSrc(src, {allowRelative: true})
    return safe == null ? parse.Reject : safe
}

/**
 * Inline image leaf (`img`). Param is a scheme-checked `src` URL string.
 * Selectable; parses from `img[src]`.
 */
export const Image = Leaf.Type.define<string>("Image", {
    inline: true,
    validate: validateImageSrc,
    shape: {element: "img", attributes: (src) => ({src})},
    selectable: true,
    parseRules: [
        {
            selector: "img[src]",
            readElement: (elt) => readImageSrc(elt),
        },
    ],
})

/**
 * Block figure with a single image (`figure` > `img`). Param is the image `src`.
 * Selectable; higher-precedence parse when a `figcaption` is absent.
 */
export const Figure = Leaf.Type.define<string>("Figure", {
    validate: validateImageSrc,
    shape: {structure: (src) => Elt.mk("figure", [Elt.mk("img", {src})])},
    selectable: true,
    group: G.Content,
    parseRules: [
        {
            selector: "figure:has(img[src])",
            marksFrom: "img[src]",
            readElement: (elt) => readImageSrc(elt),
            precedence: 2,
        },
    ],
})

/**
 * Figure with caption content (`figure` > `img` + `figcaption`).
 * Param is the image `src`; inline content lives in the caption.
 * Preferentially matches figures that include a `figcaption`.
 */
export const CaptionedFigure = Plot.Type.define<string>("CaptionedFigure", {
    inlineContent: true,
    validate: validateImageSrc,
    shape: {structure: (src) => Elt.mk("figure", [Elt.mk("img", {src}), Elt.mk("figcaption", [0])]), atom: false},
    group: G.Content,
    parseRules: [
        {
            selector: "figure:has(img[src]):has(figcaption)",
            marksFrom: "img[src]",
            readElement: (elt) => readImageSrc(elt),
            contentElement: "figcaption",
            precedence: 4,
        },
    ],
})

/**
 * Accessible alt text on image-like nodes (`alt` on the preferred `img` target).
 * Targets {@link Image}, {@link Figure}, and {@link CaptionedFigure}.
 */
export const ImageAlt = Mark.Type.define<string>("ImageAlt", {
    target: [Image, Figure, CaptionedFigure],
    validate: "string",
    shape: {attribute: "alt", value: 0, preferTarget: "img"},
})

/**
 * Display width in CSS pixels (`style: width: Npx` on the preferred `img`).
 * Targets {@link Image}, {@link Figure}, and {@link CaptionedFigure}.
 */
export const ImageSize = Mark.Type.define<number>("ImageSize", {
    target: [Image, Figure, CaptionedFigure],
    validate: "number",
    shape: {attribute: "style", value: (size: number) => `width: ${size}px`, preferTarget: "img"},
})
