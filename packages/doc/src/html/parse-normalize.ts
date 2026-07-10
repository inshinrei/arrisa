/** DOM preprocessing and HTML tag classification used by the HTML parser. */

function normalizeList(dom: Element) {
    for (let child = dom.firstChild, prevItem: ChildNode | null = null; child; child = child.nextSibling) {
        if (child.nodeType != 1) continue
        let name = child.nodeName.toLowerCase()
        if (prevItem && (name == "ol" || name == "ul")) {
            prevItem.appendChild(child)
            child = prevItem
        } else {
            prevItem = name == "li" ? child : null
        }
    }
}

const normalizers: Record<string, (dom: Element) => void> = {ol: normalizeList, ul: normalizeList}

const ignoreTags = new Set(["head", "noscript", "object", "script", "style", "title"])

const blockTags = new Set([
    "address",
    "article",
    "aside",
    "blockquote",
    "canvas",
    "dd",
    "div",
    "dl",
    "fieldset",
    "figcaption",
    "figure",
    "footer",
    "form",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hgroup",
    "hr",
    "li",
    "noscript",
    "ol",
    "output",
    "p",
    "pre",
    "section",
    "table",
    "tfoot",
    "ul",
])

export {normalizers, ignoreTags, blockTags}
