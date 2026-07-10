/**
 * Minimal DOM factory for schema UI panels (image dialog, form rows, etc.).
 *
 * Not part of the public package API — only used inside this package.
 *
 * `cr(tag, attrs?, ...children)` creates an element:
 * - Optional attrs object may include event handlers (`onclick`, `onchange`, …),
 *   boolean attributes (`true` → present, `false`/`null` → omitted), and a
 *   `style` string or CSSStyleDeclaration-like object.
 * - Children may be nodes, strings, numbers, arrays (flattened), or nullish.
 */

type Child = Node | string | number | null | undefined | readonly Child[]

function appendChildren(parent: HTMLElement, children: readonly Child[]) {
    for (let child of children) {
        if (child == null) continue
        if (typeof child == "string" || typeof child == "number") {
            parent.appendChild(document.createTextNode(String(child)))
        } else if (Array.isArray(child)) {
            appendChildren(parent, child)
        } else {
            parent.appendChild(child as Node)
        }
    }
}

/**
 * Create a DOM element with optional attributes and children.
 *
 * @example
 * ```ts
 * cr("button", {type: "submit", class: "ok", onclick: close}, "OK")
 * cr("span", {class: "row"}, label, input)
 * ```
 */
export function cr(tag: string, ...args: any[]): any {
    let elt = document.createElement(tag)
    let i = 0
    if (args.length && args[0] != null && typeof args[0] == "object" && !(args[0] instanceof Node) && !Array.isArray(args[0])) {
        let attrs = args[0] as Record<string, any>
        i = 1
        for (let name in attrs) {
            let value = attrs[name]
            if (value == null) continue
            if (name == "style" && typeof value == "object") {
                Object.assign(elt.style, value)
            } else if (/^on/.test(name) && typeof value == "function") {
                elt.addEventListener(name.slice(2).toLowerCase(), value)
            } else if (value === true) {
                elt.setAttribute(name, "")
            } else if (value !== false) {
                elt.setAttribute(name, String(value))
            }
        }
    }
    appendChildren(elt, args.slice(i))
    return elt
}
