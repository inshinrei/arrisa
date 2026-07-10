/**
 * Flexible document inputs for {@link EditorState.create}: Plot.Doc, JSON,
 * HTML (browser), or a schema factory function.
 */
import {type Node, Plot, type Schema, parse} from "@arrisa/doc"
import {htmlStringToElement, type HtmlFromStringOptions, type TrustedHTMLPolicy} from "./html-from-string"

export type DocSource = Plot.Doc | HTMLElement | DocumentFragment | string | Node.JSON | ((schema: Schema) => Plot.Doc)

export type ReadDocOptions = {
    /**
     * Sanitize untrusted HTML strings before `innerHTML`. Required for safe
     * use of string docs from user/content sources (e.g. plug DOMPurify).
     */
    sanitizeHTML?: (html: string) => string
    /**
     * App Trusted Types policy for string docs. Arrisa does not create an
     * identity policy.
     */
    trustedHTMLPolicy?: TrustedHTMLPolicy | null
}

function readHTML(html: string, options?: ReadDocOptions): HTMLElement {
    let opts: HtmlFromStringOptions = {
        wrapTables: false,
        sanitize: options?.sanitizeHTML,
        trustedHTMLPolicy: options?.trustedHTMLPolicy,
    }
    return htmlStringToElement(html, opts)
}

/** Normalize a {@link DocSource} into a {@link Plot.Doc} for `schema`. */
export function readDoc(schema: Schema, doc?: DocSource, options?: ReadDocOptions): Plot.Doc {
    if (!doc)
        return schema.doc(
            schema.docTag.type.canBeEmpty ? [] : [schema.createAndFill(schema.defaultContentTag(schema.docTag.type)!)],
        )
    if (doc instanceof Plot.Doc) return doc.schema == schema ? doc : schema.doc(doc.content)
    if (typeof doc == "function") return doc(schema)
    if (typeof doc == "string") doc = readHTML(doc, options)
    let {nodeType} = doc as any
    if (nodeType === 1 || nodeType === 11) return parse(schema, doc as HTMLElement | DocumentFragment)
    return schema.docFromJSON(doc as Node.JSON)
}
