/**
 * Clipboard serialization and parsing for Arrisa document slices.
 *
 * **Write path** (`writeClipboard`):
 * 1. `clipboardOutputFilter` on the slice
 * 2. Serialize to HTML with optional defining-node context; table fragments
 *    are wrapped via {@link wrapMap}; mark root with `arrisa-content`
 * 3. `clipboardOutputHTMLFilter` → `text/html`
 * 4. Custom `clipboardTextSerializer` or default text → text filters → `text/plain`
 *
 * **Read path** (`readClipboard`):
 * - Prefer plain text in code blocks / plain mode; else HTML when present
 * - Arrisa HTML is detected via `[arrisa-content=true]`; open edges use `arrisa-open`
 * - WebKit may replace spaces with NBSP spans; those are restored after parse
 * - Optional {@link htmlSanitize} runs before HTML string → DOM (XSS boundary)
 */
import {
    EditorState,
    htmlStringToElement,
    wrapMap as tableWrapMap,
    type TrustedHTMLPolicy,
} from "@arrisa/state"
import {Slice, Node, Leaf, Plot, Token, Pos, serialize, parse} from "@arrisa/doc"
import browser from "./browser"

export const clipboardOutputFilter = EditorState.Facet.define<(content: Slice, state: EditorState) => Slice>()
export const clipboardOutputHTMLFilter = EditorState.Facet.define<(html: string, state: EditorState) => string>()
export const clipboardTextSerializer =
    EditorState.Facet.define<(slice: Slice, context: readonly Plot.Tag[], state: EditorState) => string | null>()
export const clipboardOutputTextFilter = EditorState.Facet.define<(text: string, state: EditorState) => string>()

export const clipboardInputFilter = EditorState.Facet.define<(content: Slice, state: EditorState) => Slice>()
export const clipboardInputHTMLFilter = EditorState.Facet.define<(html: string, state: EditorState) => string>()
export const clipboardTextParser = EditorState.Facet.define<(text: string, state: EditorState) => Slice | null>()
export const clipboardInputTextFilter = EditorState.Facet.define<(text: string, state: EditorState) => string>()

/**
 * Sanitize clipboard HTML **before** `innerHTML` assignment. First provided
 * function wins. Plug DOMPurify (or similar) for untrusted paste/drop.
 * Schema filters alone are not an XSS boundary.
 */
export const htmlSanitize = EditorState.Facet.define<(html: string) => string, ((html: string) => string) | null>({
    combine: (fns) => (fns.length ? fns[0] : null),
})

/**
 * App-supplied Trusted Types policy for clipboard HTML. Arrisa never creates
 * an identity `createHTML` policy.
 */
export const trustedHTMLPolicy = EditorState.Facet.define<TrustedHTMLPolicy, TrustedHTMLPolicy | null>({
    combine: (policies) => (policies.length ? policies[0] : null),
})

export function writeClipboard(state: EditorState, slice: Slice, context: readonly Plot.Tag[], data: DataTransfer) {
    for (let filter of state.facet(clipboardOutputFilter)) slice = filter(slice, state)

    let includeContext = 0
    for (let i = 0; i < context.length; i++) {
        let next = context[i]
        if (next.type.defining && (!includeContext || next.type != context[includeContext - 1].type))
            includeContext = i + 1
        else if (next.type.defining || !next.isTextblock) break
    }
    let doc = detachedDoc(),
        dom = serialize
            .slice(slice, {
                context,
                includeContext,
                openAttr: "arrisa-open",
            })
            .toDOM()

    let needsWrap,
        wrappers = 0
    while (
        dom.firstChild &&
        dom.firstChild.nodeType == 1 &&
        (needsWrap = wrapMap[dom.firstChild.nodeName.toLowerCase()])
    ) {
        for (let i = needsWrap.length - 1; i >= 0; i--) {
            let wrapper = doc.createElement(needsWrap[i])
            wrapper.setAttribute("arrisa-wrap", "true")
            while (dom.firstChild) wrapper.appendChild(dom.firstChild)
            dom.appendChild(wrapper)
            wrappers++
        }
    }

    if (dom.firstChild && dom.firstChild.nodeType == 1) (dom.firstChild as Element).setAttribute("arrisa-content", "true")

    let wrap = doc.createElement("div")
    wrap.appendChild(dom)

    let html = wrap.innerHTML
    for (let filter of state.facet(clipboardOutputHTMLFilter)) html = filter(html, state)
    data.setData("text/html", html)

    let text: string | undefined | null
    for (let serialize of state.facet(clipboardTextSerializer)) {
        if ((text = serialize(slice, context, state)) != null) break
    }
    if (text == null) text = slice.textContent({blockSeparator: "\n\n"})
    for (let filter of state.facet(clipboardOutputTextFilter)) text = filter(text, state)
    data.setData("text/plain", text)
}

/** Read Arrisa open-edge marker from a serialized element. */
export function isOpen(elt: Element) {
    return (elt.getAttribute("arrisa-open") || null) as "start" | "end" | "start end" | null
}

export function readClipboard(state: EditorState, data: DataTransfer, targetContext: Pos, plain: boolean) {
    let html = data.getData("text/html")
    let text =
        data.getData("text/plain") || data.getData("Text") || data.getData("text/uri-list").replace(/\r?\n/g, " ")
    let slice: Slice,
        context: readonly Plot.Tag[] = []
    if (text && (targetContext.parent.node.type.hasRole(Node.Role.Code) || !html || plain)) {
        for (let filter of state.facet(clipboardInputTextFilter)) text = filter(text, state)
        slice = readClipboardText(state, text, targetContext, plain)
    } else if (!html) {
        return null
    } else {
        for (let filter of state.facet(clipboardInputHTMLFilter)) html = filter(html, state)
        let sanitize = state.facet(htmlSanitize)
        let policy = state.facet(trustedHTMLPolicy)
        let dom = htmlStringToElement(html, {
            wrapTables: true,
            sanitize: sanitize || undefined,
            trustedHTMLPolicy: policy,
        })
        if (browser.webkit) restoreReplacedSpaces(dom)

        let fromArrisa = dom.querySelector("[arrisa-content=true]")
        ;({slice, context} = parse.slice(state.schema, dom, {
            collapseWhiteSpace: !fromArrisa,
            isOpen: fromArrisa ? isOpen : undefined,
        }))
    }
    for (let filter of state.facet(clipboardInputFilter)) slice = filter(slice, state)
    return {slice, context}
}

function readClipboardText(state: EditorState, text: string, context: Pos, plain: boolean) {
    if (!plain)
        for (let parser of state.facet(clipboardTextParser)) {
            let slice = parser(text, state)
            if (slice) return slice
        }

    let marks = plain ? [] : context.marks()
    if (context.parent.node.type.hasRole(Node.Role.Code))
        return Slice.of([Leaf.text(text.replace(/\r?\n|\r/g, "\n"), marks)])
    let lines = text.split(/(?:\r\n?|\n)+/)
    let content: Token[] = lines[0] ? [Leaf.text(lines[0], marks)] : []
    if (lines.length == 1) return Slice.of(content)
    let parent = (context.parent.node.inlineContent ? context.parent.parent || context.parent : context.parent).node.tag
    let wrapping = state.schema.findWrapping(parent.type, Leaf.Text)
    if (!wrapping || !wrapping.length) return Slice.of([Leaf.text(text.replace(/\r?\n|\r/g, " "), marks)])
    let wrapper = wrapping[wrapping.length - 1]
    content.push(Plot.End)
    for (let i = 1; i < lines.length - 1; i++)
        content.push(wrapper.create(lines[i] ? [Leaf.text(lines[i], marks)] : []))
    content.push(wrapper)
    let last = lines[lines.length - 1]
    if (last) content.push(Leaf.text(last, marks))
    return Slice.of(content)
}

/** Re-export shared table fragment wrappers (write + read paths). */
export const wrapMap = tableWrapMap

let _detachedDoc: Document | null = null
function detachedDoc() {
    return _detachedDoc || (_detachedDoc = document.implementation.createHTMLDocument("title"))
}

function restoreReplacedSpaces(dom: HTMLElement) {
    let nodes = dom.querySelectorAll(browser.chrome ? "span:not([class]):not([style])" : "span.Apple-converted-space")
    for (let i = 0; i < nodes.length; i++) {
        let node = nodes[i]
        if (node.childNodes.length == 1 && node.textContent == "\u00a0" && node.parentNode)
            node.parentNode.replaceChild(dom.ownerDocument.createTextNode(" "), node)
    }
}
