/**
 * Minimal CSS module shim: compile style specs to CSS rules and mount them
 * into a document or shadow root.
 *
 * Vendored from [style-mod](https://github.com/marijnh/style-mod) (Marijn
 * Haverbeke). Create modules once and store them — do not rebuild per render.
 * Rules only appear in a DOM root after {@link StyleModule.mount}.
 *
 * **Spec shape**
 * - Plain props: camelCase or kebab-case → CSS declarations (`fontWeight` →
 *   `font-weight`). A trailing `_suffix` on the key is stripped so the same
 *   property can be emitted twice (vendor fallbacks).
 * - Sub-selectors: any key containing `&` replaces each `&` with the current
 *   selector (`"&:hover": {…}`, `"p &, div &": {…}`).
 * - `@`-blocks: object values under `@media`, `@keyframes`, etc. nest rules
 *   inside that at-rule. Bare at-rules with a null value emit a statement
 *   (`@import …;`).
 *
 * **Mount**
 * Uses `adoptedStyleSheets` when the root has no `head` (shadow roots) and the
 * environment supports constructable stylesheets; otherwise a single `<style>`
 * tag. Module order determines cascade order; remounting with a new order
 * reorders already-mounted modules.
 */

/** Class-name prefix (Unicode Greek capital letter Yot) for {@link StyleModule.newName}. */
const C = "\u037c"
/** Global counter key for unique class names (shared across realm via `Symbol.for`). */
const COUNT = typeof Symbol == "undefined" ? "__" + C : Symbol.for(C)
/** Per-root attachment key for the active {@link StyleSet}. */
const SET = typeof Symbol == "undefined" ? "__styleSet" + Math.floor(Math.random() * 1e8) : Symbol("styleSet")

/** Property bag holding the global name counter (and whatever else lives on the global). */
type GlobalBag = Record<PropertyKey, unknown>
const top: GlobalBag =
    typeof globalThis != "undefined"
        ? (globalThis as unknown as GlobalBag)
        : typeof window != "undefined"
          ? (window as unknown as GlobalBag)
          : {}

/**
 * Nested style specification: CSS properties, `&` sub-selectors, or `@`-blocks.
 *
 * Values may be primitives (emitted as declarations), nested {@link StyleSpec}
 * objects (sub-rules or at-rule bodies), or `null`/`undefined` (skipped, except
 * null under a bare `@` selector which emits a statement).
 */
export type StyleSpec = {
    [propOrSelector: string]: string | number | StyleSpec | null | undefined
}

/** Options for {@link StyleModule} construction. */
export type StyleModuleOptions = {
    /**
     * Called on regular (non-`@`) selectors after `&` expansion to produce the
     * final selector text. Not applied to `@`-rule names or keyframe step
     * selectors.
     */
    finish?(sel: string): string
}

/** Options for {@link StyleModule.mount}. */
export type StyleModuleMountOptions = {
    /** CSP nonce set on the generated `<style>` tag (ignored for adopted sheets). */
    nonce?: string
}

/** DOM root that can host mounted style modules. */
export type StyleModuleRoot = Document | ShadowRoot

/** Root with optional attached {@link StyleSet} (internal). */
type RootWithSet = StyleModuleRoot & {[key: symbol]: StyleSet | undefined; [key: string]: StyleSet | undefined}

/**
 * A frozen-in-practice set of CSS rules compiled from a style spec.
 * Mount with {@link StyleModule.mount} before relying on the rules in a root.
 */
export class StyleModule {
    /**
     * Compiled CSS rule strings in declaration order.
     * @internal
     */
    rules: string[]

    /**
     * Compile `spec` into CSS rule strings.
     *
     * When `options.finish` is set, it rewrites each regular selector after
     * `&` expansion (useful for scoping with a unique class from
     * {@link StyleModule.newName}).
     */
    constructor(spec: {[selector: string]: StyleSpec}, options?: StyleModuleOptions) {
        this.rules = []
        let {finish} = options || {}

        function splitSelector(selector: string): string[] {
            return /^@/.test(selector) ? [selector] : selector.split(/,\s*/)
        }

        function render(selectors: string[], spec: StyleSpec | null | undefined, target: string[], isKeyframes?: boolean) {
            let local: string[] = [],
                isAt = /^@(\w+)\b/.exec(selectors[0]),
                keyframes = isAt && isAt[1] == "keyframes"
            if (isAt && spec == null) return target.push(selectors[0] + ";")
            for (let prop in spec) {
                let value = spec[prop]
                if (/&/.test(prop)) {
                    render(
                        prop.split(/,\s*/).flatMap((part) => selectors.map((sel) => part.replace(/&/, sel))),
                        value as StyleSpec,
                        target,
                    )
                } else if (value && typeof value == "object") {
                    if (!isAt)
                        throw new RangeError("The value of a property (" + prop + ") should be a primitive value.")
                    render(splitSelector(prop), value, local, !!keyframes)
                } else if (value != null) {
                    local.push(
                        prop.replace(/_.*/, "").replace(/[A-Z]/g, (l) => "-" + l.toLowerCase()) + ": " + value + ";",
                    )
                }
            }
            if (local.length || keyframes) {
                target.push(
                    (finish && !isAt && !isKeyframes ? selectors.map(finish) : selectors).join(", ") +
                        " {" +
                        local.join(" ") +
                        "}",
                )
            }
        }

        for (let prop in spec) render(splitSelector(prop), spec[prop], this.rules)
    }

    /** CSS text for all rules in this module, joined by newlines. */
    getRules(): string {
        return this.rules.join("\n")
    }

    /**
     * Generate a new unique CSS class name (prefix `\u037c` + base-36 counter).
     * Safe to call before any mount; counter is global via `Symbol.for`.
     */
    static newName(): string {
        let id = (top[COUNT] as number | undefined) || 1
        top[COUNT] = id + 1
        return C + id.toString(36)
    }

    /**
     * Ensure `modules` are available as CSS in `root`.
     *
     * Rules are inserted once per module per root. Array order is cascade
     * order (later modules win). Remounting with a different order updates
     * the cascade for already-mounted modules. Optional `nonce` is applied
     * to the `<style>` element when that path is used.
     */
    static mount(
        root: StyleModuleRoot,
        modules: StyleModule | readonly StyleModule[],
        options?: StyleModuleMountOptions,
    ): void {
        let host = root as RootWithSet
        let set = host[SET as keyof RootWithSet] as StyleSet | undefined
        let nonce = options && options.nonce
        if (!set) set = new StyleSet(root, nonce)
        else if (nonce) set.setNonce(nonce)
        set.mount(Array.isArray(modules) ? modules : [modules], root)
    }
}

/** Document → shared StyleSet when using adoptedStyleSheets (one sheet per document). */
let adoptedSet = new Map<Document, StyleSet>()

/**
 * Per-root registry of mounted modules and the sheet / style tag that holds
 * their CSS. Not exported — only {@link StyleModule.mount} creates these.
 */
class StyleSet {
    sheet?: CSSStyleSheet
    styleTag?: HTMLStyleElement
    modules: StyleModule[] = []

    constructor(root: StyleModuleRoot, nonce?: string) {
        let host = root as RootWithSet
        let doc = ((root as ShadowRoot).ownerDocument || root) as Document
        let win = doc.defaultView
        // Shadow roots (no head) prefer constructable stylesheets when available.
        if (!(root as Document).head && root.adoptedStyleSheets && win && win.CSSStyleSheet) {
            let adopted = adoptedSet.get(doc)
            if (adopted) {
                host[SET as keyof RootWithSet] = adopted
                return adopted as unknown as StyleSet
            }
            this.sheet = new win.CSSStyleSheet()
            adoptedSet.set(doc, this)
        } else {
            this.styleTag = doc.createElement("style")
            if (nonce) this.styleTag.setAttribute("nonce", nonce)
        }
        host[SET as keyof RootWithSet] = this
    }

    /**
     * Insert or reorder `modules` so their rules follow the given order.
     * Adopted sheets use `insertRule`; style-tag path rewrites full text.
     */
    mount(modules: readonly StyleModule[], root: StyleModuleRoot) {
        let sheet = this.sheet
        let pos = 0 /* Current rule offset */,
            j = 0 /* Index into this.modules */
        for (let i = 0; i < modules.length; i++) {
            let mod = modules[i],
                index = this.modules.indexOf(mod)
            if (index < j && index > -1) {
                // Ordering conflict: drop earlier placement and re-insert.
                this.modules.splice(index, 1)
                j--
                index = -1
            }
            if (index == -1) {
                this.modules.splice(j++, 0, mod)
                if (sheet) for (let k = 0; k < mod.rules.length; k++) sheet.insertRule(mod.rules[k], pos++)
            } else {
                while (j < index) pos += this.modules[j++].rules.length
                pos += mod.rules.length
                j++
            }
        }

        if (sheet) {
            if (root.adoptedStyleSheets.indexOf(this.sheet!) < 0)
                root.adoptedStyleSheets = [this.sheet!, ...root.adoptedStyleSheets]
        } else {
            let text = ""
            for (let i = 0; i < this.modules.length; i++) text += this.modules[i].getRules() + "\n"
            this.styleTag!.textContent = text
            let target = (root as Document).head || root
            if (this.styleTag!.parentNode != target) target.insertBefore(this.styleTag!, target.firstChild)
        }
    }

    /** Update the CSP nonce on the style tag if it differs. */
    setNonce(nonce: string) {
        if (this.styleTag && this.styleTag.getAttribute("nonce") != nonce) this.styleTag.setAttribute("nonce", nonce)
    }
}
