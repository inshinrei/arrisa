import {Attributes} from "./attributes"
import {isSafeAttributeName} from "./safe-attr"

/** HTML void elements: serialized without a closing tag. */
const selfClosing = new Set([
    "area",
    "base",
    "br",
    "col",
    "command",
    "embed",
    "frame",
    "hr",
    "img",
    "input",
    "keygen",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
    "menuitem",
])

/**
 * Structural element shape used by HTML/DOM serializers (avoids importing `Elt`).
 * Children mirror {@link EltChildren} with nested `EltLike` instead of `Elt`.
 */
export type EltLikeChild = EltLike | string | 0
export type EltLikeChildren = readonly EltLikeChild[]

export type EltLike = {
    readonly tagName: string
    readonly attrs: Attributes
    readonly children: EltLikeChildren
}

/**
 * Parse a virtual tag name, including optional `svg:` / `math:` namespace prefixes.
 * Local name is the DOM tag; flags drive xmlns injection and namespace URIs.
 */
export function parseTagName(name: string): {localName: string; svg: boolean; math: boolean} {
    if (/^svg:/.test(name)) return {localName: name.slice(4), svg: true, math: false}
    if (/^math:/.test(name)) return {localName: name.slice(5), svg: false, math: true}
    return {localName: name, svg: false, math: false}
}

const SVG_NS = "http://www.w3.org/2000/svg"
const MATH_NS = "http://www.w3.org/1998/Math/MathML"

/** Create an empty DOM element for this virtual node (no children). */
export function createOuterDOM(elt: EltLike, doc: Document): Element {
    let {localName, svg, math} = parseTagName(elt.tagName)
    let dom = svg
        ? doc.createElementNS(SVG_NS, localName)
        : math
          ? doc.createElementNS(MATH_NS, localName)
          : doc.createElement(localName)
    let attrs = elt.attrs
    for (let i = 0; i < attrs.length; ) {
        let name = attrs[i++],
            val = attrs[i++]
        if (isSafeAttributeName(name)) dom.setAttribute(name, val)
    }
    return dom
}

/** Escape text content for HTML (`<` and `&` only). */
function escapeText(text: string): string {
    return text.replace(/[<&]/g, (ch) => (ch == "<" ? "&lt;" : "&amp;"))
}

/** Escape an attribute value for double-quoted HTML attributes. */
function escapeAttr(val: string): string {
    return val.replace(/["&<>]/g, (ch) =>
        ch == '"' ? "&quot;" : ch == "&" ? "&amp;" : ch == "<" ? "&lt;" : "&gt;",
    )
}

/**
 * Serialize a virtual element tree to an HTML string.
 * - Child `0` (content hole) contributes nothing.
 * - `svg:svg` / `math:math` roots get an xmlns attribute.
 * - HTML void tags omit the closing tag; empty SVG/MathML tags use `/>`.
 */
export function toHTML(elt: EltLike): string {
    let html = ""
    function scan(node: EltLikeChild) {
        if (typeof node == "string") {
            html += escapeText(node)
            return
        }
        if (node === 0) return

        let {localName, svg, math} = parseTagName(node.tagName)
        if (svg && localName == "svg") html += `<svg xmlns="${SVG_NS}"`
        else if (math && localName == "math") html += `<math xmlns="${MATH_NS}"`
        else html += `<${localName}`

        let attrs = node.attrs
        for (let i = 0; i < attrs.length; ) {
            let name = attrs[i++],
                val = attrs[i++]
            if (!isSafeAttributeName(name)) continue
            html += ` ${name}="${escapeAttr(val)}"`
        }

        if ((math || svg) && !node.children.length) {
            html += "/>"
        } else if (!math && !svg && selfClosing.has(localName)) {
            html += ">"
        } else {
            html += ">"
            for (let ch of node.children) scan(ch)
            html += `</${localName}>`
        }
    }
    scan(elt)
    return html
}

/** Serialize a sequence of roots (e.g. a fragment) to HTML — no holes. */
export function toHTMLList(nodes: readonly (EltLike | string)[]): string {
    let html = ""
    for (let node of nodes) {
        if (typeof node == "string") html += escapeText(node)
        else html += toHTML(node)
    }
    return html
}

/**
 * Build a live DOM node for a virtual element or text string.
 * @throws Error when no `Document` is provided and the global `document` is unavailable
 */
export function toDOM(elt: EltLike | string, doc?: Document): Element | Text {
    doc = getDoc(doc)
    if (typeof elt == "string") return doc.createTextNode(elt)
    let dom = createOuterDOM(elt, doc)
    for (let ch of elt.children) {
        if (ch !== 0) dom.appendChild(toDOM(ch, doc))
    }
    return dom
}

/** Resolve a document: explicit arg, else the global `document`. */
export function getDoc(doc?: Document): Document {
    if (doc) return doc
    if (typeof document != "object" || !document.createElement) throw new Error("No document available")
    return document
}
