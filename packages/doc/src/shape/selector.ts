import {Attributes} from "./attributes"

/** Minimal shape needed to match a tag + class selector. */
export type Selectable = {
    readonly tagName: string
    readonly attrs: Attributes
}

/**
 * Simple CSS-like selector: optional tag plus zero or more class names.
 * Grammar: `[tag]? (.class)*` — no combinators, attributes, or pseudo-classes.
 */
export class Selector {
    private constructor(
        readonly tag: string | null,
        readonly classes: readonly string[],
    ) {}

    /**
     * Parse a selector string.
     * @throws Error when the string is empty of valid tokens or has trailing junk
     */
    static parse(selector: string): Selector {
        let m,
            tag = null,
            classes: string[] = [],
            txt = selector
        if ((m = /^[\w\d\-_\u0c00-\uffff]+/.exec(txt))) {
            tag = m[0]
            txt = txt.slice(m[0].length)
        }
        while ((m = /^\.[\w\d\-_\u0c00-\uffff]+/.exec(txt))) {
            classes.push(m[0].slice(1))
            txt = txt.slice(m[0].length)
        }
        if (txt) throw new Error("Invalid element selector " + selector)
        return new Selector(tag, classes)
    }

    /** True when tag and class list are identical (class order matters). */
    eq(other: Selector): boolean {
        return (
            other.tag == this.tag &&
            this.classes.length == other.classes.length &&
            this.classes.every((c, i) => c == other.classes[i])
        )
    }

    /**
     * True when `elt` has the required tag (if any) and every listed class
     * appears in its `class` attribute (space-separated).
     */
    match(elt: Selectable): boolean {
        if (this.tag && elt.tagName != this.tag) return false
        if (this.classes.length) {
            let tagCls = Attributes.get(elt.attrs, "class")
            if (!tagCls) return false
            let pieces = tagCls.split(/ +/)
            for (let cls of this.classes) if (!pieces.includes(cls)) return false
        }
        return true
    }
}
