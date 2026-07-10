/**
 * DOM attribute helpers for tile/shape sync: snapshot element attrs and
 * apply a minimal diff between two sorted {@link Attributes} arrays.
 */
import {Attributes} from "@arrisa/doc"

/** Read an element's attributes into a sorted {@link Attributes} list. */
export function takeAttributes(elt: Element): Attributes {
    let attrs: string[] = []
    for (let i = 0; i < elt.attributes.length; i++) {
        let {name, value} = elt.attributes[i]
        Attributes.push(attrs, name, value)
    }
    return attrs.length ? attrs : Attributes.none
}

/**
 * Apply the difference from attributes `a` to `b` on `dom`.
 * Both arrays must be sorted name/value pairs. Returns whether anything changed.
 */
export function updateAttributes(dom: Element, a: Attributes, b: Attributes) {
    let changed = false
    for (let iA = 0, iB = 0; ;) {
        let match = false
        if (iA < a.length && iB < b.length && a[iA] == b[iB]) {
            if (a[iA + 1] != b[iB + 1]) dom.setAttribute(b[iB], b[iB + 1])
            else match = true
            iA += 2
            iB += 2
        } else if (iA < a.length && (iB == b.length || a[iA] < b[iB])) {
            dom.removeAttribute(a[iA])
            iA += 2
        } else if (iB < b.length) {
            dom.setAttribute(b[iB], b[iB + 1])
            iB += 2
        } else {
            break
        }
        if (!match) changed = true
    }
    return changed
}
