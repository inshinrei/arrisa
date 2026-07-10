/**
 * Filter untrusted attribute maps before setAttribute / Attributes bags.
 */
import {Attributes, isSafeAttributeName} from "@arrisa/doc"

/** Push only safe names from a plain object into a mutable Attributes bag. */
export function pushSafeAttrs(
    base: string[],
    value: {[name: string]: string | null | undefined},
): Attributes {
    for (let attr in value) {
        let attrVal = value[attr]
        if (attrVal != null && isSafeAttributeName(attr)) Attributes.push(base, attr, attrVal)
    }
    return base
}

/**
 * Apply safe attributes to a DOM-like target.
 * When `styleAsCssText` is true, `style` is assigned via `cssText` (dialog inputs).
 */
export function setSafeAttributes(
    el: {
        setAttribute(name: string, value: string): void
        style?: {cssText: string}
    },
    attrs: {[name: string]: string},
    options?: {styleAsCssText?: boolean},
): void {
    for (let attr in attrs) {
        if (!isSafeAttributeName(attr)) continue
        if (options?.styleAsCssText && attr == "style" && el.style) el.style.cssText = attrs[attr]
        else el.setAttribute(attr, attrs[attr])
    }
}
