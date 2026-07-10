import {Attributes} from "./attributes"
import {none} from "../util/utils"
import {Selector as EltSelector} from "./selector"
import {createOuterDOM, getDoc, toDOM, toHTML, toHTMLList, type EltLike} from "./render"

/**
 * One child slot: nested {@link Elt}, leaf value (`T`, usually text),
 * or `0` marking a **content hole** filled later via {@link Elt.fill}.
 */
export type EltChild<T = string> = Elt<T> | T | 0

/**
 * Children list of a virtual element ({@link EltChild} sequence).
 * Prefer this over spelling `(Elt<T> | T | 0)[]` at call sites.
 */
export type EltChildren<T = string> = readonly EltChild<T>[]

/**
 * Fragment / fill payload without holes: nested elements and leaves only.
 */
export type EltContent<T = string> = readonly (Elt<T> | T)[]

/**
 * Immutable virtual DOM element: tag name, sorted {@link Attributes}, and children.
 *
 * Content holes (`0` / {@link Elt.hole}) let templates be built with placeholders and
 * filled, wrapped, or targeted by {@link Elt.Selector} without rebuilding the whole tree by hand.
 *
 * Namespace prefixes on `tagName`:
 * - `svg:…` → SVG namespace in {@link Elt.outerDOM} / HTML xmlns on root `svg`
 * - `math:…` → MathML namespace similarly
 */
export class Elt<T = string> {
    /** Shared empty children list (same singleton as `util/none`). */
    static empty: EltChildren<never> = none
    /** Shared singleton children list containing a single content hole. */
    static hole: EltChildren<never> & readonly [0] = [0]

    private constructor(
        readonly tagName: string,
        readonly attrs: Attributes,
        readonly children: EltChildren<T>,
    ) {}

    /**
     * True when this tree contains at least one content hole (`0`), directly or nested.
     * Text-only trees return false — this is not “has child nodes”.
     */
    get hasContent(): boolean {
        return this.children.some((ch) => ch === 0 || (ch instanceof Elt && ch.hasContent))
    }

    /** Construct an element without the overload sugar of {@link Elt.mk}. */
    static create<T = string>(
        tagName: string,
        attrs: Attributes,
        children: EltChildren<T>,
    ): Elt<Exclude<T, Elt<any> | 0>> {
        return new Elt(tagName, attrs, children as EltChildren<Exclude<T, Elt<any> | 0>>)
    }

    /** `mk(name, children?)` — no attributes. */
    static mk<T = string>(name: string, children?: EltChildren<T>): Elt<Exclude<T, Elt<any> | 0>>

    /** `mk(name, attrs, children?)` — attributes from a plain object. */
    static mk<T = string>(
        name: string,
        attrs: Record<string, string>,
        children?: EltChildren<T>,
    ): Elt<Exclude<T, Elt<any> | 0>>

    static mk<T>(
        name: string,
        arg1?: Record<string, string> | EltChildren<T>,
        arg2?: EltChildren<T>,
    ) {
        let [attrs, children]: [Attributes, EltChildren<T>] = arg2
            ? [Attributes.read(arg1 as Record<string, string>), arg2]
            : !arg1
              ? [Attributes.none, none]
              : Array.isArray(arg1)
                ? [Attributes.none, arg1 as EltChildren<T>]
                : [Attributes.read(arg1 as Record<string, string>), none]
        if (children.length == 1 && children[0] === 0) children = Elt.hole
        return new Elt<T>(name, attrs, children)
    }

    /** Same tag name and attributes. */
    eqTag(elt: Elt<any>): boolean {
        return elt.tagName == this.tagName && Attributes.eq(this.attrs, elt.attrs)
    }

    /**
     * Deep equality of children: reference equality short-circuits; nested values that
     * expose `.eq` are compared through that method (including nested `Elt`s).
     */
    eqChildren(elt: Elt<T>): boolean {
        if (elt.children == this.children) return true
        if (this.children.length != elt.children.length) return false
        for (let i = 0; i < this.children.length; i++) {
            let a = this.children[i],
                b = elt.children[i]
            if (
                a !== b &&
                (!a ||
                    !b ||
                    typeof a != "object" ||
                    typeof b != "object" ||
                    (a as any).constructor != (b as any).constructor ||
                    !(a as any).eq ||
                    !(a as any).eq(b))
            )
                return false
        }
        return true
    }

    /** Tag, attributes, and children all equal. */
    eq(other: any): boolean {
        return other instanceof Elt && this.eqTag(other) && this.eqChildren(other)
    }

    /** Create an empty DOM element for this node (attributes only, no children). */
    outerDOM(doc = document): Element {
        return createOuterDOM(this as EltLike, doc)
    }

    /**
     * Wrap this tree in `wrapper` (wrapper should contain a content hole).
     * When `target` is set, wrap the first matching descendant instead; if nothing
     * matches, wrap the root.
     */
    wrap(wrapper: Elt<T>, target?: EltSelector): Elt<T> {
        if (target) {
            let added = this.modifyBySelector(wrapper, target)
            if (added) return added
        }
        return wrapper.fill([this])
    }

    /**
     * Merge attributes onto this element (or the first descendant matching `target`).
     * If `target` is set and nothing matches, attributes are applied to the root.
     */
    addAttrs(attrs: Attributes, target?: EltSelector): Elt<T> {
        if (target) {
            let added = this.modifyBySelector(attrs, target)
            if (added) return added
        }
        return Elt.create(this.tagName, Attributes.merge(this.attrs, attrs), this.children)
    }

    /**
     * Replace every content hole with `content` (spliced in place).
     * Subtrees without holes are left as-is; subtrees with holes are copied and filled.
     */
    fill(content: EltChildren<T>): Elt<T> {
        let children: EltChild<T>[] = []
        for (let ch of this.children) {
            if (ch === 0) {
                for (let c of content) children.push(c)
            } else if (ch instanceof Elt && ch.hasContent) {
                children.push(ch.fill(content))
            } else {
                children.push(ch)
            }
        }
        return new Elt(this.tagName, this.attrs, children)
    }

    /** Serialize this tree to an HTML string (string leaf type only). */
    toHTML(this: Elt<string>): string {
        return toHTML(this as EltLike)
    }

    /** Build a live DOM tree (string leaf type only). */
    toDOM(this: Elt<string>, doc?: Document): Element | Text {
        return toDOM(this as EltLike, doc)
    }

    /**
     * Depth-first: apply wrap-or-attrs modification at the first matching node.
     * Returns null when no descendant (including self) matches.
     */
    private modifyBySelector(mod: Attributes | Elt<T>, target: EltSelector): Elt<T> | null {
        if (target.match(this)) return mod instanceof Elt ? mod.fill([this]) : this.addAttrs(mod)
        for (let i = 0; i < this.children.length; i++) {
            let ch = this.children[i],
                matched
            if (ch instanceof Elt && (matched = ch.modifyBySelector(mod, target))) {
                let copy: EltChild<T>[] = this.children.slice()
                copy[i] = matched
                return Elt.create(this.tagName, this.attrs, copy)
            }
        }
        return null
    }
}

export namespace Elt {
    /**
     * Ordered list of sibling roots (elements and/or text), not wrapped in a parent tag.
     */
    export class Fragment<T = string> {
        private constructor(readonly content: EltContent<T>) {}

        static create<T = string>(content: EltContent<T>): Fragment<T> {
            return new Fragment(content)
        }

        toHTML(this: Fragment<string>): string {
            return toHTMLList(this.content as readonly (string | EltLike)[])
        }

        toDOM(this: Fragment<string>, doc?: Document): DocumentFragment {
            let frag = getDoc(doc).createDocumentFragment()
            for (let ch of this.content) frag.appendChild(toDOM(ch as string | EltLike, doc))
            return frag
        }
    }

    /** Tag + class selector; see {@link EltSelector} / `selector.ts`. */
    export type Selector = EltSelector
    export const Selector: typeof EltSelector = EltSelector
}
