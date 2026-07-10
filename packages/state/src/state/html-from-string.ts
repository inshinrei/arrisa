/**
 * Shared browser path: HTML string → Element tree for Arrisa parse.
 *
 * Does **not** install an identity Trusted Types policy. Apps under CSP +
 * Trusted Types should pass a real policy via {@link HtmlFromStringOptions.trustedHTMLPolicy}
 * or pre-sanitize and pass {@link TrustedHTML}-compatible values.
 *
 * Untrusted input should be sanitized (see `sanitize`) before assignment —
 * schema ignore lists are not an XSS boundary.
 */

/** Policy object matching the Trusted Types `createHTML` surface. */
export type TrustedHTMLPolicy = {
    createHTML(html: string): any
}

export type HtmlFromStringOptions = {
    /**
     * When true (default for clipboard), wrap bare table fragments so browsers
     * accept them as `innerHTML`.
     */
    wrapTables?: boolean
    /** Run on the HTML string before `innerHTML` assignment. */
    sanitize?: (html: string) => string
    /**
     * App-supplied Trusted Types policy. Arrisa never creates an identity
     * policy; without this, a plain string is assigned (may throw under TT enforcement).
     */
    trustedHTMLPolicy?: TrustedHTMLPolicy | null
}

/**
 * HTML table fragments that browsers reject as bare innerHTML need ancestor
 * wrappers. Keys are lower-case tag names; values are outermost-first wrappers.
 */
export const wrapMap: {[node: string]: string[]} = {
    thead: ["table"],
    tbody: ["table"],
    tfoot: ["table"],
    caption: ["table"],
    colgroup: ["table"],
    col: ["table", "colgroup"],
    tr: ["table", "tbody"],
    td: ["table", "tbody", "tr"],
    th: ["table", "tbody", "tr"],
}

let _detachedDoc: Document | null = null
function detachedDoc() {
    if (typeof document != "object" || !document.implementation)
        throw new Error("Trying to parse an HTML string in a non-browser context.")
    return _detachedDoc || (_detachedDoc = document.implementation.createHTMLDocument("title"))
}

/**
 * Prepare a string for `innerHTML` assignment. Applies sanitize first, then
 * optional Trusted Types policy. Never calls `trustedTypes.createPolicy`.
 */
export function toAssignableHTML(html: string, options?: HtmlFromStringOptions): string | any {
    if (options?.sanitize) html = options.sanitize(html)
    let policy = options?.trustedHTMLPolicy
    if (policy) return policy.createHTML(html)
    return html
}

/**
 * Parse an HTML string into a detached element tree suitable for Arrisa's
 * `parse` / `parse.slice`. Strips leading `<meta>` tags (clipboard noise).
 */
export function htmlStringToElement(html: string, options?: HtmlFromStringOptions): HTMLElement {
    let wrapTables = options?.wrapTables !== false
    let metas = /^(\s*<meta [^>]*>)*/.exec(html)
    if (metas) html = html.slice(metas[0].length)

    let doc = detachedDoc()
    let elt = doc.createElement("div")
    let wrap: string[] | undefined
    if (wrapTables) {
        let firstTag = /<([a-z][^>\s]+)/i.exec(html)
        if (firstTag && (wrap = wrapMap[firstTag[1].toLowerCase()]))
            html =
                wrap.map((n) => "<" + n + ">").join("") +
                html +
                wrap
                    .map((n) => "</" + n + ">")
                    .reverse()
                    .join("")
    }

    elt.innerHTML = toAssignableHTML(html, options)
    if (wrap) {
        for (let i = 0; i < wrap.length; i++) {
            let next = elt.querySelector(wrap[i])
            if (next) elt = next as HTMLDivElement
        }
    }
    return elt
}
